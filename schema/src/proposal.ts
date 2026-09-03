import { z } from "zod";

export const Proposal = z.object({
  id: z.string().regex(/^P-\d{3}$/),
  kind: z.enum(["metrics", "status", "question", "synthesis", "perspective", "narrative", "keywords", "periodSummary", "changeNarrative"]),
  path: z.string(),
  value: z.unknown(),
  confidence: z.number().min(0).max(1),
  evidence: z.string(),
});

export const ProposalSet = z.object({
  proposals: z.array(Proposal).min(1),
});

export type ProposalT = z.infer<typeof Proposal>;
export type ProposalSetT = z.infer<typeof ProposalSet>;