// The three collection methods the administrator records each day, shown in a stable picker order.
export type CollectionMethod = "cash" | "link" | "knet";

export const paymentMethodLabels: Record<CollectionMethod, string> = { cash: "Cash", link: "Payment link", knet: "KNET" };

export const paymentMethodOptions: { value: CollectionMethod; label: string }[] = [
  { value: "cash", label: paymentMethodLabels.cash },
  { value: "link", label: paymentMethodLabels.link },
  { value: "knet", label: paymentMethodLabels.knet },
];
