import { z } from "zod";
import { PerspectiveNode } from "./node.js";

export const State = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  label: z.string().min(3),
  question: z.string(),
  synthesis: z.string(),
  lineStrength: z.number().min(0).max(1),
  nodes: z.record(z.string(), PerspectiveNode),
});

export type StateT = z.infer<typeof State>;