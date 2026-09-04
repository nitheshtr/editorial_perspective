import { z } from "zod";
import { State } from "./state.js";

export const Perspective = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1),
  category: z.enum(["tech", "human", "econ", "infra", "platform"]),
  summary: z.string(),
  coreArgument: z.string(),
  counterArgument: z.string(),
  bodies: z.array(z.string()),
  sparkline: z.array(z.number()),
  history: z.array(z.string()),
  sources: z.array(z.string().regex(/^source-\d{3,}$/)),
  arguments: z.array(z.object({
    id: z.string().regex(/^arg-[a-z0-9-]+$/),
    statement: z.string().min(10).max(200),
    momentum: z.enum(["up", "down"]),
    sources: z.array(z.string().regex(/^source-\d{3,}$/)).min(1),
  })).max(8).optional(),
});

export const Relation = z.object({
  from: z.string(),
  to: z.string(),
  strength: z.number().min(0).max(1),
  reason: z.string().min(3),
});

export const Topic = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    title: z.string(),
    subtitle: z.string(),
    kicker: z.string(),
    date: z.string().date(),
    nav: z.array(z.string()).min(3).max(7),
    activeNav: z.string(),
    states: z.array(State).min(1),
    perspectives: z.array(Perspective),
    relations: z.array(Relation).default([]),
  })
  .superRefine((t, ctx) => {
    const first = Object.keys(t.states[0]?.nodes ?? {}).sort().join("|");
    t.states.forEach((s, i) => {
      if (Object.keys(s.nodes).sort().join("|") !== first) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `states[${i}] node keys differ from states[0]`,
        });
      }
    });
    const ids = new Set(t.perspectives.map((p) => p.id));
    t.relations.forEach((r, i) => {
      if (!ids.has(r.from) || !ids.has(r.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `relations[${i}] references unknown perspective`,
        });
      }
    });
    t.perspectives.forEach((p) => {
      if (p.bodies.length !== t.states.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${p.id}: bodies length must equal states length`,
        });
      }
      if (p.sparkline.length !== t.states.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${p.id}: sparkline length must equal states length`,
        });
      }
    });
  });

export type TopicT = z.infer<typeof Topic>;