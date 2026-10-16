import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import manifest from "@/app/manifest";

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)));
const pngSize = (buffer: Buffer) => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) });
const isPng = (buffer: Buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

it("describes an installable just4kids app", () => {
  const app = manifest();
  expect(app.name).toBe("just4kids");
  expect(app.short_name).toBe("just4kids");
  expect(app.start_url).toBe("/");
  expect(app.scope).toBe("/");
  expect(app.display).toBe("standalone");
  expect(app.background_color).toBe("#f5f7fb");
  expect(app.theme_color).toBe("#f5f7fb");
  expect(app.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" }),
    expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }),
    expect.objectContaining({ src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }),
  ]));
});

it("ships the manifest and home-screen icons as PNGs of the listed sizes", () => {
  const icons: [string, number][] = [
    ["../public/icons/icon-192.png", 192],
    ["../public/icons/icon-512.png", 512],
    ["../public/icons/icon-maskable-512.png", 512],
    ["../src/app/apple-icon.png", 180],
  ];
  for (const [path, size] of icons) {
    const buffer = read(path);
    expect(isPng(buffer), `${path} is a PNG`).toBe(true);
    expect(pngSize(buffer), `${path} is ${size}×${size}`).toEqual({ width: size, height: size });
  }
});
