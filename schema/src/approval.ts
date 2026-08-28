import { z } from "zod";

export const Approval = z.object({
  run: z.string(),
  decidedBy: z.string(),
  decidedAt: z.string().datetime(),
  decisions: z
    .array(
      z.object({
        proposalId: z.string().regex(/^P-\d{3}$/),
        decision: z.enum(["approve", "reject", "edit"]),
        editedPayload: z.unknown().optional(),
        note: z.string().optional(),
      })
    )
    .min(1),
});

export type ApprovalT = z.infer<typeof Approval>;