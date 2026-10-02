import { z } from "zod";

export const cashAmountSchema = z.string().regex(/^(0|[1-9][0-9]{0,20})\.[0-9]{3}$/);
export const cashReconciliationSchema = z.strictObject({
  action: z.enum(["extra_cash", "refund"]), amount: cashAmountSchema.refine(value => value !== "0.000"), reason: z.string().trim().min(1).max(1000),
});
