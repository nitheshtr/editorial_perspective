import { z } from "zod";

export const Status = z.enum([
  "Dominant", "Accelerating", "Growing", "Cooling", "Emerging", "Invisible",
]);

export const SemanticMetrics = z
  .object({
    editorialWeight: z.number().min(0).max(1),
    sourceVolume: z.number().int().nonnegative(),
    independentSignals: z.number().int().nonnegative(),
    momentum: z.number().min(0).max(1),
    emergence: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    status: Status,
  })
  .superRefine((m, ctx) => {
    if (m.independentSignals > m.sourceVolume) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "independentSignals cannot exceed sourceVolume",
      });
    }
    if (m.status === "Invisible" && m.emergence > 0.05) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invisible status requires emergence <= 0.05",
      });
    }
  });

export type SemanticMetricsT = z.infer<typeof SemanticMetrics>;