import { z } from "zod";

export const cashAmountSchema = z.string().regex(/^(0|[1-9][0-9]{0,20})\.[0-9]{3}$/);
