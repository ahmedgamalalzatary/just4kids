import { fromFils, toFils } from "./money";

// The daily salon total is the sum of its three collection methods, computed in integer fils.
export function salonTotal(cash: string, link: string, knet: string): string {
  return fromFils(toFils(cash) + toFils(link) + toFils(knet));
}

export const salonMoneyLabels = { cash: "Cash", link: "Payment link", knet: "KNET" } as const;

export function shareText(share: number): string {
  return `${share.toFixed(1)}%`;
}
