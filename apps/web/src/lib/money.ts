// KWD has 1,000 fils per dinar. Amounts travel as exact decimal strings and are computed in integer fils.

export function toFils(amount: string): bigint {
  const negative = amount.startsWith("-");
  const [dinars = "0", fils = ""] = (negative ? amount.slice(1) : amount).split(".");
  const value = BigInt(dinars) * 1000n + BigInt(fils.padEnd(3, "0").slice(0, 3) || "0");
  return negative ? -value : value;
}

export function fromFils(fils: bigint): string {
  const negative = fils < 0n;
  const absolute = negative ? -fils : fils;
  return `${negative ? "-" : ""}${absolute / 1000n}.${(absolute % 1000n).toString().padStart(3, "0")}`;
}

export function formatKwd(amount: string): string {
  return `${fromFils(toFils(amount))} KWD`;
}

/**
 * Turns a typed KWD amount into the exact three-decimal form ("1" → "1.000", "2.5" → "2.500").
 * A blank amount counts as zero; anything that is not a non-negative amount with up to three decimals returns null.
 */
export function normalizeAmount(value: string): string | null {
  const text = value.trim();
  if (text === "") return "0.000";
  const match = /^(\d*)(?:\.(\d{0,3}))?$/.exec(text);
  if (!match || (match[1] === "" && !match[2])) return null;
  return `${BigInt(match[1] || "0")}.${(match[2] ?? "").padEnd(3, "0")}`;
}

/** A stored amount for an editable field: zero shows as an empty field so it can be typed over directly. */
export const amountField = (amount: string): string => (toFils(amount) === 0n ? "" : amount);

/** A stored count for an editable field: zero shows as an empty field so it can be typed over directly. */
export const countField = (count: number): string => (count === 0 ? "" : String(count));
