# Editorial Perspective Map — Implementation Specification

**Version 0.3 · Companion to SPECv4 · August 27, 2026**

SPECv4 defines *what* the product is and *why* (editorial methodology, data
model, agents, orchestration, roadmap). This document defines *how exactly*:
language and tooling decisions, executable schemas, the source access &
licensing model, the **tool-neutral agent layer and pipeline runtime**, run
persistence & replay, telemetry, CI/CD, tests, guardrails, and the
scalability path.

**The application and its pipeline are fully self-sustaining in the
repository.** No agent host is required to run anything: agent definitions,
workflows, provider/model configuration, and all tooling live in the repo and
execute via `npm`/CLI with API keys from environment variables.

---

## Table of Contents

0. [Relationship to SPECv4](#0-relationship-to-specv4)
1. [Architecture Decision Records](#1-architecture-decision-records)
2. [Tooling Stack](#2-tooling-stack)
3. [Repository Layout](#3-repository-layout)
4. [Executable Schemas (zod)](#4-executable-schemas-zod)
5. [Source Access & Licensing Model](#5-source-access--licensing-model)
6. [Agent Definitions (`agents/`)](#6-agent-definitions-agents)
7. [Pipeline Runtime (`pipeline/`)](#7-pipeline-runtime-pipeline)
8. [Skills (`skills/`)](#8-skills-skills)
9. [CLI Tool Specifications](#9-cli-tool-specifications)
10. [Metrics, Trace & Telemetry](#10-metrics-trace--telemetry)
11. [Pipeline as Code](#11-pipeline-as-code)
12. [Testing Strategy](#12-testing-strategy)
13. [Guardrails (Code-Enforced)](#13-guardrails-code-enforced)
14. [Scalability Path](#14-scalability-path)
15. [Wiring Checklist (First-Time Setup)](#15-wiring-checklist-first-time-setup)

---

## 0. Relationship to SPECv4

Where this document and SPECv4 disagree, **this document wins** (it is newer
and more precise). Known deltas:

| SPECv4 / earlier said | IMPLEMENTATION.md v0.3 says |
|------------------------|-----------------------------|
| SPECv4 originally listed tools as `.mjs` files (§4) | Tools are **TypeScript** (`.ts`) via `tsx` (ADR-001); SPECv4 now aligned |
| Source has an `access` field (§5.4) | Source carries a full **`accessPolicy`** object (§5; SPECv4 patched) |
| §7.3 handoff criterion "access verified" | "accessPolicy resolved from the publisher registry" |
| v0.1 of this doc placed agents/skills under `.opencode/` | **Removed.** Agents live in `agents/`, skills in `skills/`, executed by the repo-owned `pipeline/` runtime (ADR-002) — no agent host dependency |
| Approval gate described procedurally (§7.1) | Approval is a **structurally enforced artifact** — the apply stage refuses to run without a committed approval record (ADR-005, §13) |
| ADR-005 defined git-only run persistence | ADR-006 adds storage backends: S3 overflow for bulk blobs, DB as a disposable analytics index — git remains the source of truth |

Everything else in SPECv4 stands, including the data contracts (§5), the
orchestration lanes (§7), and the roadmap phases (§9).

---

## 1. Architecture Decision Records

### ADR-001: TypeScript as the Pipeline Language

**Status:** Accepted · 2026-08-27

**Context.** The "backend" is a build-time pipeline, not a running server.
Agents are LLM-driven workflows; analysis clustering happens via LLM API
calls, not local ML. The frontend is vanilla JavaScript.

**Decision:** TypeScript (Node 20+) for all pipeline code — schemas,
migration, generation, validation, agent runtime, telemetry, tests.

**Rationale:** one language/runtime across frontend and pipeline; zod schemas
shared everywhere; agent workloads are LLM orchestration (language-agnostic);
trivial CI.

**Escape hatch — Python sidecar** (`analysis-svc/` invoked as a CLI over the
same JSON files) only if: (1) local embeddings at scale (>2,000
articles/topic) become necessary, (2) metric computation becomes
dataframe-scale batch work, or (3) a required library is Python-only. Until a
trigger fires: one language.

### ADR-002: Tool-Neutral, Repo-Owned Agent Layer

**Status:** Accepted · 2026-08-27

**Context.** v0.1 defined agents and skills as host-specific files
(`.opencode/...`), coupling the editorial pipeline to one tool. The product
intent is a **standalone, self-sustaining repo**: all agent definitions and
all AI provider/model configuration must live in the repository and run
without any agent host.

**Decision:**

- **`agents/*.md`** — four portable agent definitions (frontmatter: id,
  stage, model reference, tool grants, write scope; body: the prompt)
- **`skills/*.md`** — four workflow playbooks, read by humans and injected as
  context by the pipeline when a workflow runs
- **`pipeline/`** — a TypeScript runtime that executes agents via configured
  LLM APIs (provider adapters), grants tools in code, enforces write scopes
  with path guards, and emits telemetry
- **`config/pipeline.json`** — the single place mapping each stage to a
  provider/model/temperature, plus budgets, retries, and search settings.
  Committed to the repo. Secrets never are: keys come from `.env`
  (gitignored; `.env.example` committed)
- **No `.opencode/` directory.** Any tool-specific adapters, if ever wanted,
  would be thin wrappers over `agents/*.md` — the repo works fully without
  them

**Consequences:** the pipeline runs headless via npm on any machine or in CI;
prompts and workflows are host-independent; switching a model or provider is
a one-line config change; interactive agent hosts become conveniences, never
dependencies.

### ADR-003: Metrics & Trace

**Status:** Accepted · 2026-08-27

**Decision.** Every pipeline run emits a structured, zod-validated **JSONL
event stream**: `llm_call` (provider, model, tokens in/out, cost, latency,
attempt), `tool_call`, `stage_start/end`, `proposal`, `approval`, `apply`,
`validation`, `budget`, `error`. Streams live beside the run
(`data/runs/{runId}/telemetry.jsonl`) with an append-only cross-run summary
(`data/telemetry/summary.jsonl`). `pipeline report` prints per-stage
durations, token totals, and cost.

**Consequences:** full cost and latency visibility per stage/agent; debuggable
runs; audit trail in git; dashboards can be added later behind the same
emitter interface (§14).

### ADR-004: Scalability by Construction

**Status:** Accepted · 2026-08-27

**Decision.** Stages are **stateless functions over typed artifacts**
(cache → proposals → narrative → approval → topic JSON). Storage goes through
a repository layer (`pipeline/src/tools/store.ts`), never raw fs calls, so
the backend can move from JSON files to a database by swapping one layer.
Per-topic file locks serialize applies; provider failover, retry/backoff,
per-run cost budgets, and fetch concurrency caps are runtime config.

**Consequences:** moving a stage to a queue/worker, adding a runner machine,
or swapping storage touches one layer. Explicit trigger conditions in §14.

### ADR-005: Run Persistence & Replay

**Status:** Accepted · 2026-08-27

**Context.** Revisiting an analysis must not require re-running LLM agents.

**Decision.** Every run persists a complete, self-contained record under
`data/runs/{runId}/` (committed to git):

```
data/runs/{runId}/
├── manifest.json          # inputs: topic, period, params, models used, git SHA
├── research/
│   ├── cache-delta.json   # exactly what this run appended to the article cache
│   └── response.md        # raw LLM response (if any narrative summary)
├── analysis/
│   ├── proposals.json     # the P-id proposal set (structured)
│   └── response.md        # raw LLM response (re-parseable without re-gen)
├── writing/
│   ├── narrative.json     # revised text by field path
│   └── response.md
└── telemetry.jsonl        # this run's event stream
```

**Consequences:**

- **Replay with zero LLM calls:** `pipeline replay --run <id>` re-opens any
  past proposal set for review, re-approval, and re-apply
- **Partial reruns:** `pipeline rerun --run <id> --from analysis` reuses all
  upstream artifacts and regenerates only downstream stages
- **Deterministic gates re-run free:** validation and apply are code, never
  LLM — approval can happen days after generation
- Raw responses are kept so future prompt/parser improvements can re-extract
  from old runs without re-generation

### ADR-006: Artifact Storage Backends — Git Default, S3 Overflow, DB as Index

**Status:** Accepted · 2026-08-27

**Context.** ADR-005 makes runs replayable without LLM calls. The open
question is *where artifacts live* as volume grows: files/git, object storage
(S3), or a database.

**Decision.** Three distinct roles, never conflated:

1. **Git = source of truth (default).** `manifest.json` and
   `analysis/proposals.json` are small and replay-critical — they always live
   in git. Replay (review, re-approve, re-apply) works from any clone,
   offline, forever.
2. **S3/object storage = overflow for bulk raw blobs.** When raw LLM
   responses and telemetry streams grow large, they move to S3 via the
   artifact sink; git keeps manifest + proposals; the manifest records the
   S3 location of every offloaded blob. Replay needs nothing beyond git;
   re-extraction fetches blobs on demand.
3. **DB = derived index for analytics, never source of truth.** SQLite
   (zero-ops) populated by `pipeline index --run <id>` for cross-run queries:
   cost trends, proposal acceptance rates, confidence drift over time.
   Postgres only if multi-writer/remote access is needed. The index is
   disposable — drop it and rebuild from committed artifacts at any time.

**Implementation:** an `ArtifactSink` interface behind the repository layer
(ADR-004):

```ts
// pipeline/src/tools/artifacts.ts
export interface ArtifactSink {
  put(runId: string, path: string, content: string | Buffer): Promise<string>; // → location URI
  get(location: string): Promise<string | Buffer>;
  list(runId?: string): Promise<string[]>;
}
// Implementations: GitSink (default) · S3Sink (optional) · CompositeSink
// (config rule: replay-critical core → git, bulk raw → S3)
```

- `git` (default): writes under `data/runs/`, returns a repo-relative path
- `s3` (optional): `PutObject`/`GetObject` with key
  `{prefix}/{runId}/{path}`, returns `s3://bucket/key`; the
  `@aws-sdk/client-s3` dependency is added **only when this sink is enabled**
- `composite`: per the `artifacts` config block (§7.4)
- `pipeline replay` is sink-agnostic — it resolves locations through the
  manifest

**Trigger conditions (anti-speculation — do not build ahead):**

- Enable the **S3 sink** when: total `data/runs/` exceeds ~50 MB, or > ~200
  runs, or a team/CI setup needs a central blob store
- Add the **DB index** when: you actually query across runs (> ~1k runs, or
  the analytics need arrives). Until then `pipeline report` covers it

**Consequences:** replay never depends on LLM calls *or* on S3/DB
availability (the replay-critical core is always in git); storage can scale
to S3/DB without touching agent definitions, stage code, or the approval
flow; the DB is disposable by design.

---

## 2. Tooling Stack

| Tool | Version | Purpose |
|------|---------|---------|
| Node | 20 LTS | Runtime; native `--env-file` for `.env` (no dotenv dep) |
| TypeScript | 5.5+ strict | All pipeline and tool code |
| zod | 3.23+ | Executable schemas (§4), telemetry validation |
| tsx | 4.x | TS execution for CLI tools, no build step |
| vitest | 2.x | Unit, snapshot, golden-file, and pipeline tests |
| cheerio | 1.x | HTML metadata extraction in the fetch tool |
| GitHub Actions | — | CI: validate → test → generate → deploy Pages |

**Frontend policy:** vanilla ES-module JavaScript, no framework, no bundler
(matches V3). `generate-site.ts` inlines topic JSON into a self-contained
`dist/index.html`.

---

## 3. Repository Layout

```
editorial_perspective/
├── agents/                                 ●  ADR-002
│   ├── research-agent.md
│   ├── analysis-agent.md
│   ├── writing-assistant.md
│   └── content-manager.md
├── skills/                                 ●  ADR-002
│   ├── new-topic-creation.md
│   ├── period-update-flow.md
│   ├── data-validation.md
│   └── design-system.md
├── pipeline/                               ●  ADR-002/003/005
│   └── src/
│       ├── runner.ts                       # stage orchestration, run manifest
│       ├── providers/
│       │   ├── types.ts                    # LlmProvider interface
│       │   ├── openrouter.ts               # default (OpenAI-compatible)
│       │   ├── anthropic.ts
│       │   └── openai.ts
│       ├── tools/
│       │   ├── websearch.ts                # Tavily / provider search
│       │   ├── webfetch.ts                 # fetch + cheerio metadata extraction
│       │   ├── store.ts                    # repository layer (guarded writes)
│       │   └── artifacts.ts                # ArtifactSink: git | s3 | composite (ADR-006)
│       ├── guards.ts                       # path allowlists per agent (code-enforced)
│       ├── telemetry.ts                    # event emitter + sinks (ADR-003)
│       ├── replay.ts                       # replay / rerun commands (ADR-005)
│       ├── approve.ts                      # approval-record helper
│       └── report.ts                       # run summaries
├── schema/src/                             ●  + telemetry.ts, approval.ts
│   ├── policy.ts  metrics.ts  source.ts  node.ts  state.ts  topic.ts
│   ├── telemetry.ts  approval.ts
│   └── index.ts
├── config/
│   └── pipeline.json                       ●  provider/model map, budgets (ADR-002)
├── tools/
│   ├── generate-site.ts
│   ├── migrate-from-html.ts
│   └── validate-topic.ts
├── src/                                    # Frontend (unchanged from SPECv4 §4)
│   ├── index.html
│   ├── css/{main.css,variables.css}
│   └── js/{app.js, render/*, data/*, utils/*}
├── data/
│   ├── topics/{index.json, ai-superrace.json}
│   ├── articles/articles_cache.json
│   ├── config/publishers.json              # publisher policy registry (§5)
│   ├── runs/{runId}/                       ●  ADR-005 — committed
│   ├── approvals/{runId}.json              ●  committed (audit trail)
│   ├── telemetry/summary.jsonl             ●  committed
│   └── backups/{slug}/{timestamp}.json
├── templates/topic.json
├── tests/{unit/, golden/, snapshots/, pipeline/}
├── .github/workflows/publish.yml
├── .env.example                            ●  committed (no values)
├── .gitignore                              ●  .env, node_modules/, dist/
├── docs/{SPEC.md, SPECv4.md, IMPLEMENTATION.md, RELEASE_NOTES.md}
├── editorial_perspective_evolution_v3.html
├── package.json
└── tsconfig.json
```

---

## 4. Executable Schemas (zod)

Single source of truth for every tool, stage, and test. Never re-declare
shapes by hand.

```ts
// schema/src/policy.ts
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
```

```ts
// schema/src/metrics.ts
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
```

```ts
// schema/src/source.ts
import { z } from "zod";
import { AccessPolicy } from "./policy";

export const SourceType = z.enum(["ANALYSIS", "REPORT", "OPINION", "FEATURE"]);
export const Stance = z.enum(["supporting", "challenging", "neutral"]);

export const Source = z.object({
  id: z.string().regex(/^source-\d{3,}$/),
  publisher: z.string().min(1),
  title: z.string().min(3),
  description: z.string().max(400),
  date: z.string().date(),                    // ISO YYYY-MM-DD (zod >= 3.21)
  type: SourceType,
  url: z.string().url(),
  accessPolicy: AccessPolicy,
  storyCluster: z.string().regex(/^cluster-\d+$/),
  originalReporting: z.boolean(),
  stance: Stance,
  perspectives: z.array(z.string()).min(1),
});

export type SourceT = z.infer<typeof Source>;
```

```ts
// schema/src/node.ts
import { z } from "zod";
import { SemanticMetrics } from "./metrics";

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
```

```ts
// schema/src/topic.ts
import { z } from "zod";
import { PerspectiveNode } from "./node";

export const State = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  label: z.string().min(3),
  question: z.string(),
  synthesis: z.string(),
  lineStrength: z.number().min(0).max(1),
  nodes: z.record(z.string(), PerspectiveNode),
});

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
```

Added in v0.2 — telemetry and approval schemas:

```ts
// schema/src/telemetry.ts
import { z } from "zod";

export const TelemetryEvent = z.object({
  ts: z.string().datetime(),
  run: z.string(),                              // run id (ULID/UUID)
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

// Documented llm_call data contract (validated in telemetry.ts, not here):
// { provider, model, tokensIn, tokensOut, costUsd, latencyMs, attempt }
```

```ts
// schema/src/approval.ts
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
```

Cross-file checks (source IDs resolving into the article store, manifest
consistency) stay in `tools/validate-topic.ts` (§9), not in the topic schema.

---

## 5. Source Access & Licensing Model

**Principle:** the system never asks *"can we take this article?"* — it asks
*"what are we allowed to do with this source?"* Every publisher and source
carries an explicit `accessPolicy`.

### 5.1 Field Semantics & Enforcement Points

| Field | Values | Meaning | Enforced at |
|-------|--------|---------|-------------|
| `access` | `open` \| `metered` \| `paywalled` | Readability | Research stage (ingestion gate) |
| `license` | `CC` \| `CC-BY` \| `CC-BY-ND` \| `CC-BY-SA` \| `copyright` \| `unknown` | Legal basis | Validation (pre-publish) |
| `reuse` | `allowed_with_attribution` \| `link_only` \| `none` | What the system may do | Writing stage + Validation |
| `fullText` | boolean | May body text be reproduced | Research stage (extraction gate) |
| `summary` | boolean | May a summary be written | Writing stage |
| `link` | boolean | May it be linked | Validation (`true` required to ingest) |
| `pendingVerification` | boolean | Awaiting human license check | Validation (reports queue) |

Hard rules (zod refines in §4):

- `fullText: true` requires `reuse: allowed_with_attribution`
- `license: unknown` caps `reuse` at `link_only`
- `link: false` sources are never ingested
- Generic `CC` must be upgraded to a specific license before any reuse beyond
  `link_only` — only via human verification
- **`fullText` stays `false` everywhere as of v0.3** — excerpt handling with
  attribution formatting is future work; the schema reserves the capability

### 5.2 Publisher Registry — `data/config/publishers.json`

Per-publisher default policies; per-source overrides only after human
verification. Shape:

```jsonc
{
  "publishers": [
    {
      "name": "The Conversation",
      "tier": 1,
      "policy": {
        "access": "open",
        "license": "CC",
        "reuse": "allowed_with_attribution",
        "fullText": false,
        "summary": true,
        "link": true,
        "pendingVerification": true
      },
      "notes": "Republication generally permitted under Creative Commons with attribution; verify per-article license and no-derivatives scope before any excerpt use."
    }
  ]
}
```

**Tiers:** `1` verified republication-friendly · `2` link + summarize only ·
`3` unverified auto-addition (`license: "unknown"`, `reuse: "link_only"`,
`pendingVerification: true`).

### 5.3 Seeded Registry — Initial 10 Sources

**Tier 1 — particularly attractive:**

| Publisher | Seeded policy | Notes |
|-----------|--------------|-------|
| The Conversation | `CC` · `allowed_with_attribution` · `pendingVerification: true` | The standout — explicit CC republication program. Upgrade `license` to the specific variant per article before any excerpt use. |
| Public Knowledge | `unknown` · `link_only` · `pendingVerification: true` | Open-access analytical material; license unverified |
| Brookings | `unknown` · `link_only` · `pendingVerification: true` | Freely readable ≠ CC-licensed; verify per article |
| Carnegie Endowment | `unknown` · `link_only` · `pendingVerification: true` | Same |
| Chatham House | `unknown` · `link_only` · `pendingVerification: true` | Same |

**Tier 2 — excellent, but copyrighted (discovery + synthesis only):**

| Publisher | Seeded policy | Rationale |
|-----------|--------------|-----------|
| Reuters | `copyright` · `link_only` | Explicitly commercializing content access; IP protection emphasized |
| Associated Press | `copyright` · `link_only` | Terms forbid copying/display/transmission except as permitted |
| BBC | `copyright` · `link_only` | — |
| NPR | `copyright` · `link_only` | — |
| The Guardian | `copyright` · `link_only` | — |

### 5.4 Policy-Resolution Flow (Research Stage)

```
1. Normalize publisher name → look up in data/config/publishers.json
2. Found            → apply registry policy (per-source override only if
                      human-verified override exists on the article)
3. Not found        → append publisher as tier 3, license "unknown",
                      reuse "link_only", pendingVerification: true
                      → flagged in run summary for human license review
4. Extract metadata within policy limits:
   - always: title, publisher, date, type, canonical URL, ≤40-word description
   - full text: never as of v0.3 (policy.fullText is false everywhere)
```

**Verification queue:** `pendingVerification: true` entries are listed by
`validate-topic.ts` in every report. A human checks the publisher's actual
license, then edits the registry manually. **Agents never upgrade policies.**

### 5.5 Where Licensing Is Enforced

| Point | Mechanism |
|-------|-----------|
| Ingestion | Research stage resolves policy; paywalled skipped; unregistered → tier 3 |
| Prose | Writing stage writes summaries only where `summary: true`; never quotes body text |
| Pre-publish | `validate-topic.ts` re-checks every policy refine against the registry |
| Reader-facing | Source cards render a license/attribution badge derived from the policy |

---

## 6. Agent Definitions (`agents/`)

Four portable markdown files. The frontmatter is read by the pipeline runtime
(model selection, tool grants, write scopes); the body is the LLM prompt.
Tool grants and write scopes are **enforced by `pipeline/src/guards.ts`** at
runtime (§13) — prompt contracts are a second layer, not the only one.

### 6.1 `agents/research-agent.md`

```markdown
---
id: research-agent
stage: research
model: models.research
tools: [websearch, webfetch, cache-append, registry-append]
writeScope:
  - data/articles/articles_cache.json
  - data/config/publishers.json
inputs: [topic slug, keywords, date window, publisher registry]
outputs: [cache delta, run summary, verification-queue additions]
---

You are the Research Agent for the Editorial Perspective Map project.

ROLE
Discover and cache source material for one topic per run. You are a discovery
and metadata agent: you never decide editorial meaning — that is the Analysis
Agent's job.

WRITE SCOPE (hard contract, also enforced by the runtime)
You may write ONLY to:
- data/articles/articles_cache.json (append-only)
- data/config/publishers.json (append tier-3 verification-queue entries only)
Any other write is a contract violation. Topic data is owned exclusively by
the Content Manager.

WORKFLOW
1. Read the topic file named in the invocation; extract keywords and the
   priority publisher list.
2. Search the web for recent editorial coverage matching the keywords within
   the requested date window (default: last 90 days).
3. For each candidate: fetch the URL and extract metadata only — publisher,
   title, date, type (ANALYSIS | REPORT | OPINION | FEATURE), and a short
   description (<=40 words, written in your own words).
4. Resolve the accessPolicy: look up the publisher in
   data/config/publishers.json (IMPLEMENTATION.md Section 5). If absent,
   append a tier-3 entry: license "unknown", reuse "link_only",
   pendingVerification true. Never upgrade a policy yourself.
5. Duplicate control: skip if the canonical URL or title already exists in
   the cache. If an article covers an existing story, reuse its storyCluster
   id; otherwise mint a new cluster id.
6. Append validated entries to data/articles/articles_cache.json. Never
   modify or delete existing entries.
7. Paywalled or metered articles are logged, never ingested.

CONSTRAINTS
- Metadata and short descriptions only. Never reproduce article body text.
  fullText extraction stays disabled while every policy has fullText: false.
- Preserve publisher names verbatim.
- Maximum 3 new articles per perspective per run.

OUTPUT
End with a run summary: new entries (per perspective), duplicates skipped,
paywalled/metered skipped, verification-queue additions, and any anomalies
(encountered, with URLs).
```

### 6.2 `agents/analysis-agent.md`

```markdown
---
id: analysis-agent
stage: analysis
model: models.analysis
tools: []                      # reads cache + topic via runner context; writes nothing
writeScope: []                 # proposals are persisted by the runner, not by the agent
inputs: [topic JSON, article cache, previous state]
outputs: [analysis/proposals.json, analysis/response.md]
---

You are the Analysis Agent for the Editorial Perspective Map project.

ROLE
Convert the article corpus into evidence-backed perspective and trend
proposals (SPECv4 Section 6.2). You PROPOSE; you never write. The runner
persists your proposal set; the Content Manager applies changes only after
human approval.

STALE-CACHE GUARD
Before anything else: if the article cache's latest update predates the start
of the period under analysis, STOP and report "stale cache" with both dates.
Do not analyze stale data.

WORKFLOW
1. Read the topic JSON and article cache provided in the invocation.
2. Cluster cached articles by semantic similarity of titles and descriptions;
   reuse existing storyCluster assignments before forming new clusters.
3. Distinguish themes from arguments; identify candidate perspectives.
4. Identify supporting and counterarguments per perspective.
5. Count independence from story clusters (one cluster = one independent
   signal, regardless of republication count).
6. Calculate metrics: sourceVolume, independentSignals, momentum, emergence,
   editorialWeight, confidence (0-1 scales; SPECv4 Section 5.1).
7. Assign one status per perspective: Dominant, Accelerating, Growing,
   Cooling, Emerging, or Invisible.
8. Compare current vs previous state; produce a structural change report.
9. Suggest central-question evolution (8-15 words, action-oriented) and draft
   a synthesis referencing at least 3 distinct perspectives.

CONSTRAINTS
- Every claim must cite specific article counts and story clusters.
- Never invent perspectives — surface only what the corpus supports.
- Every status assignment carries a confidence value; flag any classification
  with confidence < 0.6 for explicit human attention.

OUTPUT FORMAT
Structured JSON matching the proposals schema (P-001, P-002, ...), each
independently approvable/rejectable:
1. Per-perspective metrics/status entries (current → proposed).
2. Structural change report (emergences, coolings, threshold crossings).
3. Proposed central question + draft synthesis for the new period.
4. Evidence appendix: cluster IDs and counts behind every proposal.
```

### 6.3 `agents/writing-assistant.md`

```markdown
---
id: writing-assistant
stage: writing
model: models.writing
tools: []
writeScope: []                 # narrative persisted by the runner
inputs: [topic JSON, analysis proposals, mode (draft|refine|audit)]
outputs: [writing/narrative.json, writing/response.md]
---

You are the Writing Assistant for the Editorial Perspective Map project.

ROLE
Refine all narrative text — perspective summaries, core arguments,
counterarguments, central questions, syntheses — for editorial quality and
consistent tone. The runner persists your output; the Content Manager applies
approved text.

MODES
- draft: write new narrative from the proposal set provided
- refine: improve existing narrative in the topic JSON
- audit: quality report only, no rewrites

WORKFLOW (draft/refine)
1. Review narrative across all perspectives and states.
2. Flag repetitive phrasing, inconsistent terminology, weak questions, and
   synthesis that fails to integrate perspectives.
3. Rewrite iteratively:
   a. Each perspective summary unique and distinctive (<=40% overlap with
      any other perspective).
   b. Counterarguments represented fairly and concretely.
   c. Central questions show clear progression across periods (8-15 words).
   d. Synthesis answers: what do the perspectives collectively reveal?
4. Flag unsupported or overly strong claims for human review.

WORKFLOW (audit)
1. Cross-perspective uniqueness scan.
2. Central-question progression check (no duplicated or stalled questions).
3. Source titles: descriptive and accurate?
4. Report issues with severity and recommended fixes.

CONSTRAINTS
- Tone: authoritative, analytical, measured. Never sensationalist.
- Length discipline: perspective summaries 40-60 words; syntheses 50-80
  words; central questions 8-15 words.
- Present tense, active voice. No hyperbole, no unqualified predictions.
- Never alter metrics, positions, statuses, or source data — text fields only.
- Licensing: write summaries only where the source policy allows
  (policy.summary). Never quote article body text; fullText is false for all
  sources.

OUTPUT
Revised text organized by field path (e.g. perspectives[human-impact].summary,
states[2].question) for mechanical merge, plus flags list.
```

### 6.4 `agents/content-manager.md`

```markdown
---
id: content-manager
stage: apply
model: models.apply
tools: [store-write, validate, backup]
writeScope:
  - data/topics/
  - data/backups/
inputs: [topic JSON, runId, approval record (data/approvals/{runId}.json)]
outputs: [updated topic JSON, updated manifest, apply report]
---

You are the Content Manager for the Editorial Perspective Map project.

ROLE
Manage the topic-data lifecycle. You are the ONLY agent that writes to
data/topics/ and the topic manifest — and only after verifying that a valid
human approval record exists for the run whose proposals you are applying.

OPERATIONS

create-new:
  1. Load templates/topic.json; populate metadata (slug, title, subtitle,
     kicker, nav), perspectives (summary, core argument, counterargument,
     category, sources), and default states per skills/new-topic-creation.md.
  2. Validate: npx tsx tools/validate-topic.ts <slug>
  3. Save data/topics/<slug>.json; update data/topics/index.json.

migrate:
  1. Run: npx tsx tools/migrate-from-html.ts --in <path> --slug <slug>
  2. Review the migration report; verify numerics preserved exactly.
  3. Validate and save; flag all placeholder metrics for Analysis review.

apply-approved:
  1. Verify data/approvals/{runId}.json exists and parses against the
     approval schema. If missing: STOP — nothing is applied without approval.
  2. Back up first: copy data/topics/<slug>.json to
     data/backups/<slug>/<timestamp>.json. Never transform without a backup.
  3. Merge ONLY approved proposals (by P-id), honoring edit decisions.
  4. Re-validate. On failure: report the exact failing checks, restore the
     backup, save nothing.
  5. Update the manifest. Report exactly what changed.

validate / backup / restore:
  validate: run the validator; return the full pass/fail report.
  backup:   timestamped copy to data/backups/<slug>/.
  restore:  restore a named backup after confirming with the human.

CONSTRAINTS
- Never apply unapproved proposals — no exceptions.
- Back up before every transform or apply operation.
- Preserve exact numeric precision on any migration or merge.
- Keep data/topics/index.json in sync with every create/archive operation.
```

---

## 7. Pipeline Runtime (`pipeline/`)

The runtime is the sole executor of agents — a plain TypeScript CLI. No agent
host involved.

### 7.1 Provider Interface

```ts
// pipeline/src/providers/types.ts
export interface ChatMessage { role: "system" | "user" | "assistant"; content: string; }

export interface LlmProvider {
  complete(req: {
    model: string;
    system?: string;
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<{
    text: string;
    usage: { tokensIn: number; tokensOut: number };
    raw: unknown;          // persisted verbatim into the run directory (ADR-005)
  }>;
}
```

Adapters: **openrouter** (default; OpenAI-compatible endpoint — gives access
to GLM and every other model with one key), **anthropic**, **openai**. Every
adapter normalizes usage and cost, emits `llm_call` telemetry, applies
retry/backoff, and enforces the run's cost budget (`budget` events; halt on
exceed).

### 7.2 Tools & Guards

- `tools/websearch.ts` — search via configured provider (Tavily by default;
  provider-native search where available). Concurrency-capped.
- `tools/webfetch.ts` — fetch + cheerio metadata extraction (title,
  canonical URL, publisher, date). Metadata only; never stores body text.
- `tools/store.ts` — the **repository layer**: every read/write of
  `data/**` goes through it; `guards.ts` enforces each agent's `writeScope`
  from `agents/*.md` frontmatter. **Out-of-scope writes throw at runtime** —
  code enforcement, not prompt enforcement (§13).

### 7.3 Stage Execution Model

| Stage | Executor | LLM? | Artifacts |
|-------|----------|------|-----------|
| `research` | research-agent via LLM | yes | `research/cache-delta.json`, cache append |
| `analysis` | analysis-agent via LLM | yes | `analysis/proposals.json`, `response.md` |
| `writing` | writing-assistant via LLM | yes | `writing/narrative.json`, `response.md` |
| `approval` | **human** — writes `data/approvals/{runId}.json` | no | approval record (committed) |
| `apply` | content-manager prompt + deterministic merge code | no* | updated topic JSON, manifest |
| `validate` | `tools/validate-topic.ts` | no | validation report |
| `publish` | `tools/generate-site.ts` + git push | no | `dist/index.html` |

*The apply stage consults content-manager's prompt for merge semantics but
the merge itself is deterministic code paths with the approval schema as
input — replay-safe and LLM-optional.

The runner: mints `runId`, writes `manifest.json` (inputs, params, model
versions, git SHA), runs stages sequentially, stops before `apply` until an
approval record exists, and emits telemetry throughout.

### 7.4 Configuration — `config/pipeline.json` (committed)

```jsonc
{
  "models": {
    "models.research": { "provider": "openrouter", "model": "z-ai/glm-5.3-flash", "temperature": 0.2 },
    "models.analysis": { "provider": "openrouter", "model": "z-ai/glm-5.3-flash", "temperature": 0.3 },
    "models.writing":  { "provider": "openrouter", "model": "z-ai/glm-5.3-flash", "temperature": 0.4 },
    "models.apply":    { "provider": "openrouter", "model": "z-ai/glm-5.3-flash", "temperature": 0.1 }
  },
  "defaults": { "maxTokens": 4096, "timeoutMs": 120000 },
  "retry": { "maxAttempts": 3, "backoffMs": 2000 },
  "failover": { "models.analysis": ["z-ai/glm-5.3-flash"] },
  "budget": { "maxCostUsdPerRun": 5.0, "actionOnExceed": "halt" },
  "search": { "provider": "tavily", "maxResults": 10 },
  "concurrency": { "maxParallelFetches": 4 },
  "telemetry": { "sink": "jsonl", "dir": "data/telemetry" },
  "artifacts": {
    "sink": "git",
    "rawToS3": false,
    "s3": { "bucket": "", "prefix": "runs/" }
  }
}
```

Model IDs evolve; `config/pipeline.json` is the single place to change them.
Any stage can be pinned to a different model/provider with one line.

### 7.5 Secrets — `.env` (gitignored) / `.env.example` (committed)

```
OPENROUTER_API_KEY=      # required (default provider)
TAVILY_API_KEY=          # required (search)
# optional, only if used in config/pipeline.json:
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

Loaded via `node --env-file=.env`. Never committed; never logged (telemetry
records model/provider, never keys).

---

## 8. Skills (`skills/`)

Plain markdown playbooks at the repo root — read by humans, and included as
context by the runner when a workflow references them. Tool-neutral.

### 8.1 `skills/new-topic-creation.md`

```markdown
# New Topic Creation

Guided workflow for creating a new topic from scratch (SPECv4 §8.1).

1. Define the topic (human-led)
   - Choose a topic with genuine editorial disagreement
   - Headline-style title + subtitle; nav label + kicker
   - Pick 4-6 perspectives representing distinct editorial lenses

2. Establish perspectives
   - Per perspective: summary, core argument, counterargument
   - Assign category (tech/human/econ/infra/platform)
   - Run: npm run pipeline -- stage=research topic=<slug>
     (accessPolicies resolved per publisher registry)

3. Baseline state (oldest period) — positions/statuses by relative coverage;
   baseline central question + synthesis

4. Intermediate state(s) — coverage shifts, transitional question

5. Current state — run analysis + writing stages on the real corpus;
   ensure question progression tells a coherent story

6. Validate and review
   - npm run validate
   - Writing Assistant audit mode
   - Verify accessPolicy for every source

7. Export
   - content-manager: create-new → data/topics/<slug>.json; manifest updated

Output: validated topic JSON, ready for generate-site.
```

### 8.2 `skills/period-update-flow.md`

```markdown
# Period Update Flow

One full pass of the SPECv4 §7 pipeline — the most common maintenance task.

1. Gather    npm run pipeline -- stage=research topic=<slug>
2. Analyze   npm run pipeline -- stage=analysis topic=<slug> run=<runId>
             → proposal set (P-ids) with metrics, statuses, question, synthesis
3. Draft     npm run pipeline -- stage=writing topic=<slug> run=<runId>
4. Approve   Human reviews proposals (or `npm run pipeline -- replay --run <id>`
             to revisit later); writes data/approvals/<runId>.json
             (or: npm run pipeline -- approve --run <id>)
5. Apply     npm run pipeline -- stage=apply topic=<slug> run=<runId>
             (backup → merge approved → validate → save; failure restores backup)
6. Publish   npm run generate; inspect dist/index.html; commit + push (CI deploys)

Note: steps 1-3 persist all artifacts; you can pause and return days later,
replaying or re-approving without any LLM calls (ADR-005).
```

### 8.3 `skills/data-validation.md`

```markdown
# Data Validation

The pre-publish gate (SPECv4 §8.3), enforced mechanically by
tools/validate-topic.ts. Run after ANY content modification; mandatory
before publish.

  npm run validate                       # whole store
  npx tsx tools/validate-topic.ts <slug> # one topic
  --report json                          # machine-readable

Check catalog (summary):
- Structure: valid JSON, required keys, identical node keys across states,
  nav 3-7, ISO dates
- Geometry: x/y ∈ [0,100]; w/h ∈ (0,100]; border-radius format; opacity ∈ [0,1]
- Metrics: in range; status has confidence; independentSignals ≤ sourceVolume;
  Invisible requires emergence ≤ 0.05; arrays match state count
- Narrative: no empty fields; question 5-25 words; synthesis 20-120;
  summary 15-80; meaningful progression; ≤50% cross-perspective overlap
- Evidence: ≥3 sources per perspective; core argument AND counterargument;
  source IDs resolve in the article store; storyCluster on every source
- Licensing: accessPolicy on every source, consistent with the registry;
  reuse 'allowed_with_attribution' requires license ≠ unknown; no
  fullText: true as of v0.3; every source linkable; pendingVerification listed
- Relations: reference real perspective ids; strength ∈ [0,1]

Exit codes: 0 valid · 1 invalid · 2 error. Never publish on exit 1.
```

### 8.4 `skills/design-system.md`

```markdown
# Design System

Visual standardization and audit workflow (SPECv4 §8.4).

Scope:
- Tokens in src/css/variables.css: brand palette, status accents, category
  tints, 8px spacing rhythm, radius, shadows, type scale, z-index layers
- Component audits: header, hero, nav, map canvas (orbits, center, blobs),
  change sheet, lens modal, timeline slider, synthesis, sources panel, footer
- Breakpoints: ≥850px desktop, 561-849px tablet, ≤560px mobile
- Accessibility: contrast ≥4.5:1 body text; touch targets ≥44×44px; Escape
  closes modals/sheets; semantic landmarks; aria-labels on icon-only buttons;
  prefers-reduced-motion respected

Rules:
- Visual fidelity locked at V3 — golden-file test is the Phase 1 acceptance
  gate (§12). Intentional visual change requires --bless + RELEASE_NOTES entry.
- Output: audit report with severity ratings, or an updated token set.
```

---

## 9. CLI Tool Specifications

All tools: TypeScript via tsx, schemas from `schema/`, no network (except
pipeline stages).

### 9.1 Pipeline Runner

```
Usage:
  npm run pipeline -- workflow=period-update topic=<slug> [--until=approval]
  npm run pipeline -- stage=<research|analysis|writing|apply|validate> topic=<slug> [run=<id>]
  npm run pipeline -- replay --run <id>                 # ADR-005: zero LLM
  npm run pipeline -- rerun  --run <id> --from <stage>  # reuse upstream artifacts
  npm run pipeline -- approve --run <id>                # interactive approval helper
  npm run pipeline -- report [--run <id> | --last]
  npm run pipeline -- index  [--run <id> | --all]      # build/refresh SQLite analytics index

Behavior:
  - workflow = preset sequence of stages (skills/*.md define what each does)
  - --until=approval (default for content workflows): stop before approval
  - stage=apply REQUIRES data/approvals/<runId>.json (approval schema, §4)
  - replay: re-opens a past run's proposals for review/re-approval/re-apply —
    zero LLM calls
  - rerun --from: regenerates only downstream stages; upstream artifacts are
    reused verbatim from the run directory
  - every invocation emits a full telemetry stream (§10)

Exit codes: 0 ok · 1 stage/validation failure · 2 configuration error
```

### 9.2 `tools/validate-topic.ts`

```
Usage:
  npx tsx tools/validate-topic.ts <slug> [options]
  npx tsx tools/validate-topic.ts --all [options]

Options:
  --schema-only      zod validation only; skip cross-file reconciliation
  --report <text|json>

Checks: zod Topic schema → source-ID resolution in article cache →
licensing consistency vs publisher registry → manifest sync.

Exit codes: 0 valid · 1 failures · 2 error
```

### 9.3 `tools/generate-site.ts`

```
Usage:
  npx tsx tools/generate-site.ts [--topic <slug> | --all] [--out dist] [--check] [--bless]

Behavior:
  - Reads src/index.html template + topic JSON → self-contained
    dist/index.html (single file, like V3)
  - --check: byte-compare against tests/golden/<slug>.html; exit 1 on drift
  - --bless: re-capture golden for an intentional visual change
    (requires RELEASE_NOTES.md entry — Visual Fidelity Lock)

Exit codes: 0 ok · 1 validation/parity failure · 2 error
```

### 9.4 `tools/migrate-from-html.ts`

```
Usage:
  npx tsx tools/migrate-from-html.ts --in <path.html> --slug <slug>
                                    [--out data/topics] [--dry-run]

Behavior:
  - Extracts states[], perspectiveBodies{}, details{}, relations[] from the
    V3 HTML <script> block
  - Transforms to the current topic schema (SPECv4 §5.3); numerics preserved exactly
  - Synthesizes placeholder SemanticMetrics from source counts
    (editorialWeight = sources/maxSources; momentum from deltas) with
    confidence capped at 0.5 + "migrated" marker — forcing review before use
  - Every migrated source gets license "unknown", reuse "link_only",
    pendingVerification: true; appended to the publisher registry
  - --dry-run: report only, writes nothing

Exit codes: 0 migrated · 1 extraction failure · 2 error
```

---

## 10. Metrics, Trace & Telemetry

### 10.1 Event Flow

```
run_start ──► stage_start ──► llm_call* / tool_call* ──► stage_end
                    │                                     │
                    └────► proposal / apply / validation / budget
run_end ◄── (every event also appended to run telemetry.jsonl + summary)
```

### 10.2 What Gets Recorded

| Event | Key data |
|-------|----------|
| `llm_call` | provider, model, tokensIn, tokensOut, costUsd, latencyMs, attempt |
| `tool_call` | tool (websearch/webfetch/store), target, count |
| `proposal` | run, count of P-ids, per-status confidence summary |
| `approval` | run, decidedBy, approved/rejected/edited counts |
| `apply` | proposals applied, backups path, validation result |
| `budget` | spentUsd, limitUsd, action taken |
| `error` | stage, message, recoverable flag |

### 10.3 Storage & Reporting

- Per-run stream: `data/runs/{runId}/telemetry.jsonl` (zod-validated on write)
- Cross-run summary: `data/telemetry/summary.jsonl` (one line per run: totals
  per stage — tokens, cost, latency, retries, artifact counts)
- `npm run pipeline -- report --last` prints: duration, cost by stage/model,
  tokens, tool calls, proposals created, approval status, budget headroom
- Both are committed to git (ADR-005): full audit trail, replay from any
  machine. If size ever matters, compact summaries annually and keep raw
  streams for N runs — the emitter interface already supports alternate sinks
  (§14)

### 10.4 Budget Guard

`budget.maxCostUsdPerRun` is enforced mid-run: the runner sums `llm_call`
costs and halts (default) with a `budget` event when exceeded. Partial
artifacts remain in the run directory; the run is resumable via
`rerun --from <stage>`.

---

## 11. Pipeline as Code

### 11.1 `package.json` (scripts excerpt)

```jsonc
{
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "validate": "tsx tools/validate-topic.ts --all",
    "generate": "tsx tools/generate-site.ts --all --out dist",
    "migrate": "tsx tools/migrate-from-html.ts --in editorial_perspective_evolution_v3.html --slug ai-superrace",
    "pipeline": "tsx pipeline/src/runner.ts",
    "test": "vitest run",
    "test:golden": "vitest run tests/golden"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsx": "^4.16.0",
    "vitest": "^2.0.0",
    "zod": "^3.23.0",
    "cheerio": "^1.0.0",
    "@types/node": "^20.14.0"
  }
}
```

### 11.2 `.gitignore`

```
.env
node_modules/
dist/
```

### 11.3 `.github/workflows/publish.yml`

```yaml
name: publish

on:
  push:
    branches: [main]
    paths: ["data/**", "src/**", "tools/**", "pipeline/**", "schema/**", "tests/**"]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run validate
      - run: npm test
      - run: npm run generate
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

**Pages setup:** Settings → Pages → Source: **GitHub Actions**.

**Headless pipeline (optional, later):** research/analysis stages can run on a
cron or `workflow_dispatch` with repository secrets — the approval gate keeps
them safe: without a committed approval record, nothing is ever applied or
published.

---

## 12. Testing Strategy

All vitest, four layers:

**1. Unit — `tests/unit/`**

- Schema round-trips: valid topic parses; every §8.3 failure mode has a
  rejection test (geometry, invisible/emergence conflict, unknown-license
  reuse, length mismatches…)
- AccessPolicy refines; publisher-registry resolution (match / override /
  miss → tier 3)
- Adapters: topic JSON → view models (positions, glows, trend labels)

**2. Golden-file parity — `tests/golden/` (Phase 1 acceptance gate)**

```
migrate V3 → data/topics/ai-superrace.json
generate  → dist/index.html
golden    → tests/golden/ai-superrace.html (captured from original V3)
test      → byte-compare dist vs golden; drift fails CI
```

Intentional visual change: `--check --bless` + RELEASE_NOTES entry. Optional
Playwright screenshot diff behind `RUN_VISUAL=1`.

**3. Snapshots — `tests/snapshots/`**

- View-model snapshots per state; change-sheet cards per transition type

**4. Pipeline — `tests/pipeline/`**

- `guards.test.ts`: out-of-scope writes throw per agent writeScope
- `telemetry.test.ts`: event schema validation, summary aggregation
- `providers.test.ts`: adapters against mocked transports (usage/cost
  normalization, retry, failover order)
- `replay.test.ts`: applying a fixed run's approval record produces identical
  topic output — replay determinism (ADR-005)
- `budget.test.ts`: run halts at maxCostUsdPerRun
- `artifacts.test.ts`: sink round-trips (git, mocked S3), composite routing rules, manifest location resolution (ADR-006)

---

## 13. Guardrails (Code-Enforced)

### 13.1 Runtime Tool Grants & Write Scopes

Grants come from `agents/*.md` frontmatter and are enforced by
`pipeline/src/guards.ts` at the store layer — an out-of-scope write throws;
it is never a prompt-only promise.

| Stage/Agent | Tools granted | Write scope (enforced) |
|-------------|--------------|------------------------|
| research | websearch, webfetch, cache-append, registry-append | `data/articles/articles_cache.json` (append-only), `data/config/publishers.json` (tier-3 queue) |
| analysis | none | none — runner persists proposals |
| writing | none | none — runner persists narrative |
| apply | store-write, validate, backup | `data/topics/**`, `data/backups/**`, manifest |

Reading is unrestricted — everything in-repo is safe to read; the risk
surface is writes, and writes are path-guarded in code.

### 13.2 Standing Guards

- **Approval gate (structural):** the apply stage refuses to run without a
  valid `data/approvals/{runId}.json` (schema-validated). The SPECv4 §7.1
  gate is a hard check, not a convention.
- **Stale-cache guard:** analysis refuses when the cache predates the
  analyzed period (SPECv4 §7.4)
- **Backup-before-transform:** apply copies to `data/backups/` first;
  validation failure auto-restores
- **Sole-writer serialization:** all topic-store writes flow through apply +
  a per-topic file lock — no merge conflicts possible
- **Licensing enforcement chain:** ingestion → prose → pre-publish (§5.5);
  agents never upgrade policies — only humans, via the registry
- **Cost budget:** per-run cap with halt action (§10.4)
- **Copyright discipline:** metadata + ≤40-word own-words descriptions only;
  `fullText` disabled everywhere as of v0.3; publishers always attributed+linked

---

## 14. Scalability Path

The design is scalable *by construction* (ADR-004): stateless stage
functions, typed artifacts, a repository layer, and explicit trigger
conditions for each scale-up. Do not build ahead of these triggers.

| Trigger | Action |
|---------|--------|
| Multiple topics needing updates | Already parallel: per-topic runs + per-topic locks; run lanes concurrently |
| Research fetch latency | Raise `concurrency.maxParallelFetches`; batch by publisher |
| >10,000 articles or >50 topics | Swap `tools/store.ts` to SQLite/Postgres — the repository layer is the only code that touches storage |
| Run duration >10 min, or scheduled fan-out | Stages are stateless CLIs — move them to a queue/worker unchanged; artifacts and approval files are the contract |
| Telemetry dashboards | Add an OTLP/HTTP sink behind the telemetry emitter interface (JSONL stays the default) |
| Provider rate limits / outages | `failover` model lists per stage; retries with backoff already configured |
| Cost growth | Budgets per run (§10.4); GLM defaults keep per-run cost low; per-stage model pinning when analysis quality demands it |
| `data/runs/` > ~50 MB or > ~200 runs | Enable the S3 artifact sink (ADR-006) — raw blobs move to object storage; manifest + proposals stay in git |
| Need cross-run analytics (cost trends, acceptance rates, drift) | `pipeline index` → SQLite index (ADR-006); Postgres only for multi-writer/remote access |

Explicitly deferred until triggered: queues, databases, dashboards, backend
services. The trigger conditions above are the anti-speculation gate.

---

## 15. Wiring Checklist (First-Time Setup)

1. `npm init -y`; install devDependencies (§11.1)
2. `tsconfig.json` — strict, NodeNext, include `schema/`, `pipeline/`, `tools/`, `tests/`
3. Copy `.env.example` → `.env`; set `OPENROUTER_API_KEY` (+ `TAVILY_API_KEY`)
4. Review `config/pipeline.json` — GLM defaults per stage; adjust models,
   temperature, budget as desired (model IDs evolve; this file is the only
   place to change them)
5. Create `schema/`, `pipeline/`, and the three tools per this spec
6. `npm run migrate` → `data/topics/ai-superrace.json`
7. `npm run generate` (first run captures the golden file) → commit the golden
8. `npm run validate && npm test` — all green
9. GitHub → Settings → Pages → Source: **GitHub Actions**; push to publish
10. Human task: verify licenses for `pendingVerification` publishers in
    `data/config/publishers.json` and upgrade their tiers

---

*End of Implementation Specification v0.3*
