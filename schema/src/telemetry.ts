import { z } from "zod";

export const TelemetryEvent = z.object({
  ts: z.string().datetime(),
  run: z.string(),
  level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  event: z.enum([
    "run_start", "stage_start", "llm_call", "tool_call", "stage_end",
    "proposal", "approval", "apply", "validation", "budget", "run_end", "error",
  ]),
  stage: z.string().optional(),
  agent: z.string().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});

export type TelemetryEventT = z.infer<typeof TelemetryEvent>;