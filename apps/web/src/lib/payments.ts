import type { PaymentMethod } from "@just4kids/contracts";

export const paymentMethodLabels: Record<PaymentMethod, string> = { cash: "Cash", link: "Payment link", knet: "KNET" };

export const paymentMethodOptions: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: paymentMethodLabels.cash },
  { value: "link", label: paymentMethodLabels.link },
  { value: "knet", label: paymentMethodLabels.knet },
];
