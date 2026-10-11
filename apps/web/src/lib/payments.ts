import type { PaymentMethod } from "@just4kids/contracts";

export const paymentMethodLabels: Record<PaymentMethod, string> = { cash: "نقداً", link: "رابط دفع", knet: "كي نت" };

export const paymentMethodOptions: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: paymentMethodLabels.cash },
  { value: "link", label: paymentMethodLabels.link },
  { value: "knet", label: paymentMethodLabels.knet },
];
