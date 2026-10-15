import { randomUUID } from "node:crypto";
import { access, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { HttpError } from "../../lib/http-error.js";
import type { EmployeeRepository } from "./employee.repository.js";

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const PHOTO_EDGE = 512;
// A 24 MP cap covers any phone photo while keeping peak decode memory well inside the container limit.
const MAX_INPUT_PIXELS = 24_000_000;
const allowedFormats = new Set(["jpeg", "png", "webp"]);
const unsupported = () => new HttpError(415, "UNSUPPORTED_PHOTO_TYPE", "Unsupported photo format. Use JPEG, PNG or WEBP");

sharp.concurrency(1);

export function createEmployeePhotoService(options: { uploadsDir: string; repository: EmployeeRepository }) {
  const photosDir = resolve(options.uploadsDir, "employee-photos");
  const photoPath = (id: string) => resolve(photosDir, `${id}.jpg`);
  // Serialize upload/removal per employee so an interleaved file write and photoUpdatedAt update cannot desync.
  const locks = new Map<string, Promise<unknown>>();
  function withLock<T>(id: string, action: () => Promise<T>): Promise<T> {
    const previous = locks.get(id) ?? Promise.resolve();
    const next = previous.then(action, action);
    locks.set(id, next.then(() => undefined, () => undefined));
    return next;
  }

  async function requireEmployee(id: string) {
    if (!await options.repository.get(id)) throw new HttpError(404, "EMPLOYEE_NOT_FOUND", "Employee not found");
  }

  return {
    async read(id: string): Promise<string | undefined> {
      await requireEmployee(id);
      try { await access(photoPath(id)); return photoPath(id); } catch { return undefined; }
    },

    async save(id: string, body: unknown): Promise<void> {
      await requireEmployee(id);
      if (!Buffer.isBuffer(body)) throw unsupported();
      if (body.length > MAX_PHOTO_BYTES) throw new HttpError(413, "PHOTO_TOO_LARGE", "Photo exceeds 2 MB");
      let format: string | undefined;
      try { format = (await sharp(body, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format; } catch { throw unsupported(); }
      if (!format || !allowedFormats.has(format)) throw unsupported();
      let encoded: Buffer;
      // metadata() reads only the header, so a body that overruns the pixel cap or is truncated fails here instead.
      try {
        encoded = await sharp(body, { limitInputPixels: MAX_INPUT_PIXELS }).rotate()
          .resize(PHOTO_EDGE, PHOTO_EDGE, { fit: "cover", position: "centre" }).jpeg({ quality: 82 }).toBuffer();
      } catch { throw unsupported(); }
      await withLock(id, async () => {
        await mkdir(photosDir, { recursive: true });
        const path = photoPath(id);
        const temporary = `${path}.${randomUUID()}.tmp`;
        await writeFile(temporary, encoded);
        await rename(temporary, path);
        // Version the address so a replaced photo is not served from a browser's image cache.
        await options.repository.setPhotoUpdatedAt(id, new Date());
      });
    },

    async remove(id: string): Promise<void> {
      await requireEmployee(id);
      await withLock(id, async () => {
        try { await unlink(photoPath(id)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        await options.repository.setPhotoUpdatedAt(id, null);
      });
    },
  };
}

export type EmployeePhotoService = ReturnType<typeof createEmployeePhotoService>;
