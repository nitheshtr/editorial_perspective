import { z } from "zod";

export const License = z.enum([
  "CC", "CC-BY", "CC-BY-ND", "CC-BY-SA", "copyright", "unknown",
]);
export const Reuse = z.enum(["allowed_with_attribution", "link_only", "none"]);
export const AccessLevel = z.enum(["open", "metered", "paywalled"]);

export const AccessPolicy = z
  .object({
    access: AccessLevel,
    license: License,
    reuse: Reuse,
    fullText: z.boolean(),
    summary: z.boolean(),
    link: z.boolean(),
    pendingVerification: z.boolean().default(false),
  })
  .superRefine((p, ctx) => {
    if (p.fullText && p.reuse !== "allowed_with_attribution") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "fullText requires reuse 'allowed_with_attribution'",
      });
    }
    if (p.license === "unknown" && p.reuse === "allowed_with_attribution") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "license 'unknown' cannot permit reuse beyond link_only",
      });
    }
    if (!p.link) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "every ingested source must at least allow linking",
      });
    }
  });

export type AccessPolicyT = z.infer<typeof AccessPolicy>;