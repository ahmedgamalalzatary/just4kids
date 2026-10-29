import { createHash } from "node:crypto";

// Pure conversions from the old PHP site's rows to the new schema. Decisions are recorded in docs/legacy-import.md.

export type VisitStatus = "booked" | "arrived" | "completed" | "cancelled" | "no_show";
export type LegacyAddressRow = { block: string | null; street: string | null; building: string | null; avenu: string | null; G: string | null; blue: string | null; floor: string | null; apartment: string | null };
export type ImportedAddress = { area: string; block: string; street: string; houseNumber: string; buildingName: null; avenue: string | null; gate: string | null; blueNumber: string | null; floor: string | null; apartment: string | null; mapsUrl: string | null };

// A stable name-based UUID (version 5 layout) per legacy row, so a repeated import finds the rows it already wrote.
export function legacyId(kind: string, key: string | number) {
  const hex = createHash("sha1").update(`just4kids-legacy:${kind}:${key}`).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = (8 + (parseInt(hex[16] ?? "0", 16) & 3)).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function normalizePhone(raw: string | null) {
  const digits = (raw ?? "").replace(/[\s-]/g, "");
  if (/^[0-9]{8}$/.test(digits)) return `+965${digits}`;
  const international = /^(?:\+|00)?965([0-9]{8})$/.exec(digits);
  return international ? `+965${international[1]}` : null;
}

// Open statuses (confirmed, pending, and the blank left by the failed "in_progress" write) before today are treated as done.
export function visitStatus(status: string, date: string, today: string): VisitStatus {
  if (status === "completed" || status === "cancelled") return status;
  return date < today ? "completed" : "booked";
}

// The new booking screen's default visit length; the old site stored no length at all.
export function bookingWindow(time: string) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const start = hours * 60 + minutes, end = Math.min(start + 30, 23 * 60 + 59);
  const format = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  return { startTime: format(start), endTime: format(end) };
}

export function childCounts(total: number, normal: number, special: number) {
  const childCount = Math.max(total, normal + special) || 1;
  return { childCount, specialChildCount: Math.min(special, childCount) };
}

function part(value: string | null, max = 120) {
  const trimmed = (value ?? "").trim();
  if (trimmed.length > max) throw new RangeError("too long");
  return trimmed || null;
}

// Returns null when the new address rules (area, block, street, house number) cannot be met.
export function legacyAddress(row: LegacyAddressRow, area: string | null, mapsUrl: string | null): ImportedAddress | null {
  try {
    const block = part(row.block), street = part(row.street, 200), houseNumber = part(row.building);
    if (!area || !block || !street || !houseNumber) return null;
    return { area, block, street, houseNumber, buildingName: null, avenue: part(row.avenu), gate: part(row.G), blueNumber: part(row.blue), floor: part(row.floor), apartment: part(row.apartment), mapsUrl: part(mapsUrl, 2048) };
  } catch {
    return null;
  }
}

const thousandths = (value: string) => Math.round(Number(value) * 1000);
const money = (value: number) => (value / 1000).toFixed(3);

// The new tables require total = cash + link + knet, so a row whose old total disagrees stops the import.
function checkedAmounts(cash: number, link: number, knet: number, total: string) {
  if (cash + link + knet !== thousandths(total)) throw new Error(`Total ${total} does not match its parts`);
  return { cash: money(cash), link: money(link), knet: money(knet), total: money(cash + link + knet) };
}

// Old Online money becomes Link and the old Delivery money is added to Cash, so each day's total is unchanged.
export function collectionAmounts(row: { amount_cash: string; amount_online: string; delivery_amount: string; total_amount: string }) {
  return checkedAmounts(thousandths(row.amount_cash) + thousandths(row.delivery_amount), thousandths(row.amount_online), 0, row.total_amount);
}

export function salonAmounts(row: { cash_amount: string; link_amount: string; kent_amount: string; total_amount: string }) {
  return checkedAmounts(thousandths(row.cash_amount), thousandths(row.link_amount), thousandths(row.kent_amount), row.total_amount);
}

// The old database stored timestamps in UTC through MariaDB's current_timestamp().
export function legacyUtc(value: string | null) {
  if (!value || value.startsWith("0000")) return null;
  return new Date(`${value.replace(" ", "T")}Z`);
}
