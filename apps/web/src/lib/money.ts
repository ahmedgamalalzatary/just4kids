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
  return `${fromFils(toFils(amount))} د.ك`;
}

export function invoiceTotal(input: { adultCount: number; childCount: number; adultUnitPrice: string; childUnitPrice: string }): string {
  return fromFils(BigInt(input.adultCount) * toFils(input.adultUnitPrice) + BigInt(input.childCount) * toFils(input.childUnitPrice));
}
