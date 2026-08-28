import { z } from "zod";
import { AccessPolicy } from "./policy.js";

export const SourceType = z.enum(["ANALYSIS", "REPORT", "OPINION", "FEATURE"]);
export const Stance = z.enum(["supporting", "challenging", "neutral"]);

export const Source = z.object({
  id: z.string().regex(/^source-\d{3,}$/),
  publisher: z.string().min(1),
  title: z.string().min(3),
  description: z.string().max(400),
  date: z.string().date(),
  type: SourceType,
  url: z.string().url(),
  accessPolicy: AccessPolicy,
  storyCluster: z.string().regex(/^cluster-\d+$/),
  originalReporting: z.boolean(),
  stance: Stance,
  perspectives: z.array(z.string()).min(1),
});

export type SourceT = z.infer<typeof Source>;