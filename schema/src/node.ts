import { z } from "zod";
import { SemanticMetrics } from "./metrics.js";

export const Position = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});
export const Size = z.object({
  w: z.number().gt(0).max(100),
  h: z.number().gt(0).max(100),
});
export const BorderRadius = z.string().regex(
  /^\d{1,3}% \d{1,3}% \d{1,3}% \d{1,3}% \/ \d{1,3}% \d{1,3}% \d{1,3}% \d{1,3}%$/
);
export const MobileOverride = Position.merge(Size).extend({
  opacity: z.number().min(0).max(1).optional(),
});

export const PerspectiveNode = z.object({
  position: Position,
  size: Size,
  borderRadius: BorderRadius,
  opacity: z.number().min(0).max(1),
  mobile: MobileOverride.optional(),
  metrics: SemanticMetrics,
});

export type PerspectiveNodeT = z.infer<typeof PerspectiveNode>;