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

const priceFormat = /^(0|[1-9][0-9]{0,8})(\.[0-9]{1,3})?$/;

/** The administrator's typed visit price: a blank amount counts as zero, but at least one must be typed. Null while invalid. */
export function typedPrice(input: { amountCash: string; amountLink: string }): { amountCash: string; amountLink: string } | null {
  const amountCash = input.amountCash.trim();
  const amountLink = input.amountLink.trim();
  if (amountCash === "" && amountLink === "") return null;
  const price = { amountCash: amountCash || "0", amountLink: amountLink || "0" };
  return priceFormat.test(price.amountCash) && priceFormat.test(price.amountLink) ? price : null;
}

export function invoiceTotal(input: { amountCash: string; amountLink: string }): string {
  return fromFils(toFils(input.amountCash) + toFils(input.amountLink));
}
