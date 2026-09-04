#!/usr/bin/env bun
/**
 * tools/validate-topic.ts — Editorial Perspective Map topic validator
 *
 * Usage:
 *   bun tools/validate-topic.ts <slug> [options]
 *   bun tools/validate-topic.ts --all [options]
 *
 * Options:
 *   --schema-only      zod validation only; skip cross-file reconciliation
 *   --report <text|json>
 *
 * Exit codes: 0 valid · 1 failures · 2 error
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Topic, Source, AccessPolicy, type AccessPolicyT, type SourceT } from "../schema/src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

// ── Types ──────────────────────────────────────────────────────────────────

export interface ValidationCheck {
  name: string;
  status: "pass" | "fail" | "skipped";
  details: string[];
}

export interface ValidationReport {
  slug: string;
  ok: boolean;
  checks: ValidationCheck[];
}

export interface ValidateTopicInput {
  /** The raw topic data (JSON.parse'd) */
  topic: unknown;
  /** Articles cache shape: { articles: SourceT[] } */
  articles?: { articles: SourceT[] };
  /** Publisher registry shape: { publishers: PublisherEntry[] } */
  registry?: { publishers: PublisherEntry[] };
  /** Manifest shape: { topics: Array<{ slug: string; file: string }>; active?: string } */
  manifest?: { topics: Array<{ slug: string; file: string }>; active?: string };
  /** If true, skip cross-file checks (source resolution, licensing, manifest sync) */
  schemaOnly?: boolean;
}

export interface PublisherEntry {
  name: string;
  tier: number;
  policy: AccessPolicyT;
  notes?: string;
}

// ── Core validation logic (exported for testing) ────────────────────────────

export async function validateTopic(input: ValidateTopicInput): Promise<ValidationReport> {
  const slug = (input.topic as Record<string, unknown>)?.slug as string ?? "unknown";
  const checks: ValidationCheck[] = [];
  let overallOk = true;

  // ── Check (a): Zod Topic schema parse ────────────────────────────────────
  {
    const check: ValidationCheck = { name: "schema", status: "pass", details: [] };
    const result = Topic.safeParse(input.topic);
    if (result.success) {
      check.status = "pass";
      check.details.push("Topic schema validation passed");
    } else {
      check.status = "fail";
      overallOk = false;
      for (const issue of result.error.issues) {
        check.details.push(`[${issue.path.join(".")}] ${issue.message}`);
      }
    }
    checks.push(check);
  }

  // ── Check (b): Source-ID resolution (unless schema-only or no articles) ──
  if (input.schemaOnly || !input.articles) {
    checks.push({
      name: "source-resolve",
      status: "skipped",
      details: input.schemaOnly ? ["Skipped (--schema-only)"] : ["Skipped (articles cache not provided)"],
    });
  } else {
    const check: ValidationCheck = { name: "source-resolve", status: "pass", details: [] };
    const articleMap = new Map(input.articles.articles.map((a) => [a.id, a]));
    // Collect all source IDs referenced across all perspectives
    const result = Topic.safeParse(input.topic);
    const topic = result.success ? result.data : null;

    if (!topic) {
      check.status = "skipped";
      check.details.push("Skipped (topic schema invalid, cannot resolve sources)");
    } else {
      const refdIds = new Set<string>();
      for (const p of topic.perspectives) {
        for (const sid of p.sources) {
          refdIds.add(sid);
        }
      }
      for (const sid of refdIds) {
        if (!articleMap.has(sid)) {
          check.status = "fail";
          overallOk = false;
          check.details.push(`Source ID '${sid}' not found in articles cache`);
        } else {
          check.details.push(`Source ID '${sid}' resolved`);
        }
      }
      if (check.status === "pass" && refdIds.size === 0) {
        check.details.push("No source references to resolve");
      }
    }
    checks.push(check);
  }

  // ── Check (c): Licensing ─────────────────────────────────────────────────
  // This covers: registry consistency + §5.1 hard rules
  if (input.schemaOnly || !input.articles) {
    checks.push({
      name: "licensing",
      status: "skipped",
      details: input.schemaOnly
        ? ["Skipped (--schema-only)"]
        : ["Skipped (no articles cache provided)"],
    });
  } else {
    const check: ValidationCheck = { name: "licensing", status: "pass", details: [] };
    const result = Topic.safeParse(input.topic);
    const topic = result.success ? result.data : null;

    if (!topic) {
      check.status = "skipped";
      check.details.push("Skipped (topic schema invalid)");
    } else {
      // Collect all source IDs referenced
      const refdIds = new Set<string>();
      for (const p of topic.perspectives) {
        for (const sid of p.sources) {
          refdIds.add(sid);
        }
      }

      // Map source ID → SourceT if articles are available
      const articleMap = input.articles
        ? new Map(input.articles.articles.map((a) => [a.id, a]))
        : new Map<string, SourceT>();

      // Build publisher registry map (name → entry)
      const registryMap = input.registry
        ? new Map(input.registry.publishers.map((p) => [p.name, p]))
        : new Map<string, PublisherEntry>();

      for (const sid of refdIds) {
        const source = articleMap.get(sid);
        if (!source) {
          if (input.articles) {
            // Only flag if articles were provided (otherwise we can't resolve)
            check.details.push(`Source '${sid}': not in articles cache (cannot check licensing)`);
          }
          continue;
        }

        // Check §5.1 hard rules (already enforced by AccessPolicy superRefine,
        // but we verify here too for explicit reporting)
        const policy = source.accessPolicy;
        if (policy.fullText && policy.reuse !== "allowed_with_attribution") {
          check.status = "fail";
          overallOk = false;
          check.details.push(`Source '${sid}': fullText requires reuse 'allowed_with_attribution'`);
        }
        if (policy.license === "unknown" && policy.reuse === "allowed_with_attribution") {
          check.status = "fail";
          overallOk = false;
          check.details.push(`Source '${sid}': license 'unknown' cannot permit reuse beyond link_only`);
        }
        if (!policy.link) {
          check.status = "fail";
          overallOk = false;
          check.details.push(`Source '${sid}': link must be true`);
        }

        // Check registry consistency
        const pubEntry = registryMap.get(source.publisher);
        if (!pubEntry) {
          check.details.push(`Source '${sid}': publisher '${source.publisher}' not found in registry`);
          // Note: not a fail — unregistered publishers get tier-3 treatment per §5.4
          continue;
        }

        // Compare source policy with registry default policy
        const regPolicy = pubEntry.policy;
        const mismatches: string[] = [];
        for (const key of ["access", "license", "reuse", "fullText", "summary", "link", "pendingVerification"] as const) {
          if (key === "pendingVerification") {
            // pendingVerification has default(false) so compare safely
            const sVal = (policy as Record<string, unknown>)[key] ?? false;
            const rVal = (regPolicy as Record<string, unknown>)[key] ?? false;
            if (sVal !== rVal) mismatches.push(`${key}: source=${sVal} registry=${rVal}`);
          } else {
            const sVal = (policy as Record<string, unknown>)[key];
            const rVal = (regPolicy as Record<string, unknown>)[key];
            if (sVal !== rVal) mismatches.push(`${key}: source=${sVal} registry=${rVal}`);
          }
        }
        if (mismatches.length > 0) {
          check.status = "fail";
          overallOk = false;
          check.details.push(
            `Source '${sid}': policy mismatch with registry for publisher '${source.publisher}': ${mismatches.join("; ")}`
          );
        } else {
          check.details.push(`Source '${sid}': policy matches registry for publisher '${source.publisher}'`);
        }
      }

      if (check.status === "pass" && check.details.length === 0) {
        check.details.push("No licensing issues found");
      }
    }
    checks.push(check);
  }

  // ── Check (e): Keywords & periodSummary ──────────────────────────────────
  {
    const check: ValidationCheck = { name: "node-content", status: "pass", details: [] };
    const result = Topic.safeParse(input.topic);
    const topic = result.success ? result.data : null;

    if (!topic) {
      check.status = "skipped";
      check.details.push("Skipped (topic schema invalid)");
    } else {
      let anyFailure = false;
      for (const stateIdx in topic.states) {
        const state = topic.states[stateIdx];
        for (const [nodeId, node] of Object.entries(state.nodes)) {
          const path = `states[${stateIdx}].nodes.${nodeId}`;

          // keywords validation (optional — only when present)
          if (node.keywords) {
            const kw = node.keywords;

            // Count check (zod already enforces 2-6, but this gives better messages)
            if (kw.length < 2) {
              check.details.push(`${path}.keywords: minimum 2 keywords required`);
              anyFailure = true;
            } else if (kw.length > 6) {
              check.details.push(`${path}.keywords: maximum 6 keywords allowed, got ${kw.length}`);
              anyFailure = true;
            }

            // Each keyword check
            for (let i = 0; i < kw.length; i++) {
              const k = kw[i];
              if (k.length === 0) {
                check.details.push(`${path}.keywords[${i}]: empty keyword`);
                anyFailure = true;
              }
              if (k.length > 24) {
                check.details.push(`${path}.keywords[${i}]: '${k}' exceeds 24 characters`);
                anyFailure = true;
              }
              const wordCount = k.trim().split(/\s+/).length;
              if (wordCount > 4) {
                check.details.push(`${path}.keywords[${i}]: '${k}' has ${wordCount} words (max 4)`);
                anyFailure = true;
              }
            }

            // Duplicate check (case-insensitive)
            const lowerKeywords = kw.map((k) => k.toLowerCase());
            const seen = new Set<string>();
            for (let i = 0; i < lowerKeywords.length; i++) {
              if (seen.has(lowerKeywords[i])) {
                check.details.push(`${path}.keywords[${i}]: duplicate keyword '${kw[i]}' (case-insensitive)`);
                anyFailure = true;
              }
              seen.add(lowerKeywords[i]);
            }
          }

          // periodSummary validation (optional — only when present)
          if (node.periodSummary) {
            const summary = node.periodSummary;
            const wordCount = summary.trim().split(/\s+/).length;
            if (wordCount < 10) {
              check.details.push(`${path}.periodSummary: ${wordCount} words (minimum 10)`);
              anyFailure = true;
            }
            if (wordCount > 40) {
              check.details.push(`${path}.periodSummary: ${wordCount} words (maximum 40)`);
              anyFailure = true;
            }
          }
        }
      }
      if (anyFailure) {
        check.status = "fail";
        overallOk = false;
      } else {
        check.details.push("Keywords and periodSummary checks passed (or absent)");
      }
    }
    checks.push(check);
  }

  // ── Check (d): Manifest sync ─────────────────────────────────────────────
  if (input.schemaOnly || !input.manifest) {
    checks.push({
      name: "manifest-sync",
      status: "skipped",
      details: input.schemaOnly
        ? ["Skipped (--schema-only)"]
        : ["Skipped (manifest not provided)"],
    });
  } else {
    const check: ValidationCheck = { name: "manifest-sync", status: "pass", details: [] };
    const manifestSlugs = input.manifest.topics.map((t) => t.slug);
    if (manifestSlugs.includes(slug)) {
      check.details.push(`Slug '${slug}' found in manifest`);
    } else {
      check.status = "fail";
      overallOk = false;
      check.details.push(`Slug '${slug}' not found in manifest topics`);
    }
    checks.push(check);
  }

  // ── Check (f): Arguments ──────────────────────────────────────────────────
  {
    const check: ValidationCheck = { name: "arguments", status: "pass", details: [] };
    const result = Topic.safeParse(input.topic);
    const topic = result.success ? result.data : null;

    if (!topic) {
      check.status = "skipped";
      check.details.push("Skipped (topic schema invalid)");
    } else {
      let anyFailure = false;
      for (let pi = 0; pi < topic.perspectives.length; pi++) {
        const pers = topic.perspectives[pi];
        const path = `perspectives[${pi}]`;
        const args = pers.arguments;
        if (!args) continue; // optional — absence is fine

        // Argument IDs must be unique within this perspective
        const seenIds = new Set<string>();
        for (let ai = 0; ai < args.length; ai++) {
          const arg = args[ai];
          if (seenIds.has(arg.id)) {
            check.details.push(`${path}.arguments[${ai}]: duplicate argument id '${arg.id}'`);
            anyFailure = true;
          }
          seenIds.add(arg.id);

          // Statement length (schema enforces 10-200, but we report nicely)
          if (arg.statement.length < 10) {
            check.details.push(`${path}.arguments[${ai}]: statement '${arg.statement}' too short (min 10 chars)`);
            anyFailure = true;
          }
          if (arg.statement.length > 200) {
            check.details.push(`${path}.arguments[${ai}]: statement exceeds 200 characters`);
            anyFailure = true;
          }

          // Every argument source ID must be a member of the perspective's sources array
          for (let si = 0; si < arg.sources.length; si++) {
            const sid = arg.sources[si];
            if (!pers.sources.includes(sid)) {
              check.details.push(`${path}.arguments[${ai}].sources[${si}]: '${sid}' not in perspective's sources`);
              anyFailure = true;
            }
          }
        }

        // Max 8 (schema-enforced, but report clearly)
        if (args.length > 8) {
          check.details.push(`${path}.arguments: ${args.length} arguments (max 8)`);
          anyFailure = true;
        }
      }
      if (anyFailure) {
        check.status = "fail";
        overallOk = false;
      } else {
        check.details.push("Arguments checks passed (or absent)");
      }
    }
    checks.push(check);
  }

  return { slug, ok: overallOk, checks };
}

// ── CLI wrapper ────────────────────────────────────────────────────────────

function loadJSON(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    return null;
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);

  // Parse options
  const schemaOnly = args.includes("--schema-only");
  const reportIdx = args.indexOf("--report");
  let reportFormat: "text" | "json" = "text";
  if (reportIdx !== -1 && reportIdx + 1 < args.length) {
    const fmt = args[reportIdx + 1];
    if (fmt === "json" || fmt === "text") reportFormat = fmt;
  }

  // Determine which slugs to validate
  const isAll = args.includes("--all");
  let slugs: string[] = [];

  if (isAll) {
    // Read manifest to get all slugs
    const manifestPath = join(DATA_DIR, "topics", "index.json");
    if (!existsSync(manifestPath)) {
      console.error("ERROR: Manifest not found at", manifestPath);
      return 2;
    }
    const manifest = loadJSON(manifestPath) as { topics: Array<{ slug: string; file: string }> } | null;
    if (!manifest || !Array.isArray(manifest.topics)) {
      console.error("ERROR: Invalid manifest format");
      return 2;
    }
    slugs = manifest.topics.map((t) => t.slug);
  } else {
    // Filter out options to get slugs
    slugs = args.filter((a) => !a.startsWith("--"));
  }

  if (slugs.length === 0) {
    console.error("ERROR: No topic slugs specified. Usage: validate-topic.ts <slug> | --all [options]");
    return 2;
  }

  // Load cross-file data (skip gracefully if files don't exist)
  const articlesPath = join(DATA_DIR, "articles", "articles_cache.json");
  const articles: { articles: SourceT[] } | null = existsSync(articlesPath)
    ? (loadJSON(articlesPath) as { articles: SourceT[] })
    : null;

  const publishersPath = join(DATA_DIR, "config", "publishers.json");
  const registry: { publishers: PublisherEntry[] } | null = existsSync(publishersPath)
    ? (loadJSON(publishersPath) as { publishers: PublisherEntry[] })
    : null;

  const manifestPath = join(DATA_DIR, "topics", "index.json");
  const manifest: { topics: Array<{ slug: string; file: string }>; active?: string } | null = existsSync(manifestPath)
    ? (loadJSON(manifestPath) as { topics: Array<{ slug: string; file: string }>; active?: string })
    : null;

  if (!articles && !schemaOnly) {
    console.error("NOTE: articles cache not found at", articlesPath);
  }
  if (!registry && !schemaOnly) {
    console.error("NOTE: publisher registry not found at", publishersPath);
  }
  if (!manifest && !schemaOnly) {
    console.error("NOTE: topic manifest not found at", manifestPath);
  }

  let anyFailed = false;
  const reports: ValidationReport[] = [];

  for (const slug of slugs) {
    const topicPath = join(DATA_DIR, "topics", `${slug}.json`);
    if (!existsSync(topicPath)) {
      console.error(`ERROR: Topic file not found at ${topicPath}`);
      if (reportFormat === "json") {
        reports.push({
          slug,
          ok: false,
          checks: [{ name: "schema", status: "fail", details: [`Topic file not found: ${topicPath}`] }],
        });
      } else {
        console.log(`\n❌ ${slug}: Topic file not found`);
      }
      anyFailed = true;
      continue;
    }

    const topicData = loadJSON(topicPath);
    if (!topicData) {
      console.error(`ERROR: Could not parse topic file at ${topicPath}`);
      if (reportFormat === "json") {
        reports.push({
          slug,
          ok: false,
          checks: [{ name: "schema", status: "fail", details: [`Could not parse topic file: ${topicPath}`] }],
        });
      } else {
        console.log(`\n❌ ${slug}: Could not parse topic file`);
      }
      anyFailed = true;
      continue;
    }

    const report = await validateTopic({
      topic: topicData,
      articles: articles ?? undefined,
      registry: registry ?? undefined,
      manifest: manifest ?? undefined,
      schemaOnly,
    });

    reports.push(report);
    if (!report.ok) anyFailed = true;

    if (reportFormat === "text") {
      console.log(`\n${report.ok ? "✅" : "❌"} ${report.slug}`);
      for (const check of report.checks) {
        const icon = check.status === "pass" ? "  ✅" : check.status === "fail" ? "  ❌" : "  ⏭️";
        console.log(`${icon} ${check.name}`);
        for (const d of check.details) {
          console.log(`     ${d}`);
        }
      }
    }
  }

  if (reportFormat === "json") {
    console.log(JSON.stringify(reports, null, 2));
  }

  return anyFailed ? 1 : 0;
}

// ── Entry point ────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("validate-topic.ts")) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error("FATAL:", err);
      process.exit(2);
    });
}