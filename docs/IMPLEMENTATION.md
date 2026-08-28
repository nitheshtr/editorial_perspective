# Editorial Perspective Map — Implementation Specification

**Version 0.1 · Companion to SPECv4 · August 27, 2026**

SPECv4 defines *what* the product is and *why* (editorial methodology, data
model, agents, orchestration, roadmap). This document defines *how exactly*:
language and tooling decisions, executable data schemas, the source access &
licensing model, drop-in OpenCode agent and skill files, CLI tool contracts,
CI/CD, tests, and guardrails.

---

## Table of Contents

0. [Relationship to SPECv4](#0-relationship-to-specv4)
1. [ADR-001: TypeScript as the Pipeline Language](#1-adr-001-typescript-as-the-pipeline-language)
2. [Tooling Stack](#2-tooling-stack)
3. [Repository Layout](#3-repository-layout)
4. [Executable Schemas (zod)](#4-executable-schemas-zod)
5. [Source Access & Licensing Model](#5-source-access--licensing-model)
6. [OpenCode Agent Files](#6-opencode-agent-files)
7. [OpenCode Skill Files](#7-opencode-skill-files)
8. [CLI Tool Specifications](#8-cli-tool-specifications)
9. [Pipeline as Code](#9-pipeline-as-code)
10. [Testing Strategy](#10-testing-strategy)
11. [Guardrails Matrix](#11-guardrails-matrix)
12. [Wiring Checklist (First-Time Setup)](#12-wiring-checklist-first-time-setup)

---

## 0. Relationship to SPECv4

Where this document and SPECv4 disagree, **this document wins** (it is newer
and more precise). Known deltas:

| SPECv4 said | IMPLEMENTATION.md says |
|-------------|------------------------|
| §4 lists tools as `.mjs` files | Tools are **TypeScript** (`.ts`) executed via `tsx` (ADR-001) |
| §5.4 Source has an `access` field | Source carries a full **`accessPolicy`** object (§5 here; SPECv4 §5.4 patched in the same commit) |
| §7.3 handoff criterion "access verified" | "accessPolicy resolved from the publisher registry" |

Everything else in SPECv4 stands, including the data contracts (§5), the
orchestration lanes (§7), and the roadmap phases (§9).

---

## 1. ADR-001: TypeScript as the Pipeline Language

**Status:** Accepted · 2026-08-27

**Context.** The "backend" of this project is a build-time pipeline, not a
running server. Agents are LLM-driven workflows (OpenCode agents defined in
markdown, calling tools); analysis clustering happens via LLM API calls, not
local ML. The frontend is vanilla JavaScript, and the generator tooling is
Node-based by inheritance.

**Decision:** Use **TypeScript (Node 20+)** for all pipeline code: schema
validation, migration, site generation, validation tooling, and tests.

**Rationale:**

| Factor | Assessment |
|--------|-----------|
| One language, one runtime | Frontend is JS; tools are TS; no second runtime to install or maintain |
| Shared schemas | zod definitions validate topic data once — in the generator, the validators, and (future) the renderer |
| Agent workloads | Research/Analysis/Writing are LLM API orchestration — language-agnostic; no local ML needed |
| CI | Single `setup-node` step; trivial caching |
| OpenCode integration | Agents/skills are markdown-defined; any scripts they invoke run in-repo via `npx tsx` |

**Consequences:**

- Single `package.json` dependency tree; one lockfile
- zod schemas are the single source of truth for both tooling and documentation
- Slightly weaker local-NLP story than Python (irrelevant while analysis is
  LLM-driven)

**Escape hatch — when Python earns a place:** introduce a Python sidecar
(`analysis-svc/`) invoked as a CLI over the same JSON files *only if*:

1. Phase 3 clustering needs local embeddings at scale (>2,000 articles per
   topic) and API-based clustering becomes cost- or latency-prohibitive, or
2. Metric computation grows into dataframe-style batch processing, or
3. A required analysis library is Python-only.

The JSON-file data contracts (SPECv4 §5) already allow this without
restructuring: the sidecar would read the article cache and emit proposal
files in the same shape the Analysis Agent produces. Until a trigger fires,
no second language.

---

## 2. Tooling Stack

| Tool | Version | Purpose |
|------|---------|---------|
| Node | 20 LTS | Runtime for tools and tests |
| TypeScript | 5.5+ | All pipeline code, strict mode |
| zod | 3.23+ | Executable schemas (Section 4) |
| tsx | 4.x | TS execution for CLI tools, no build step |
| vitest | 2.x | Unit, snapshot, and golden-file tests |
| GitHub Actions | — | CI: validate → test → generate → deploy Pages |

**Frontend policy:** stay vanilla ES-module JavaScript with no framework and
no bundler (matches V3). `src/` holds readable source; `generate-site.ts`
inlines topic JSON into a **self-contained `dist/index.html`** — preserving
the V3 single-file deployment model exactly.

---

## 3. Repository Layout

Extends SPECv4 §4. New/changed parts marked ●.

```
editorial_perspective/
├── .opencode/                              ●  OpenCode wiring
│   ├── agent/
│   │   ├── research-agent.md
│   │   ├── analysis-agent.md
│   │   ├── writing-assistant.md
│   │   └── content-manager.md
│   └── skills/
│       ├── new-topic-creation/SKILL.md
│       ├── period-update-flow/SKILL.md
│       ├── data-validation/SKILL.md
│       └── design-system/SKILL.md
├── docs/
│   ├── SPEC.md                             # v0.1 (historical)
│   ├── SPECv4.md                           # Product spec (what/why)
│   ├── IMPLEMENTATION.md                   # This document (how)
│   └── RELEASE_NOTES.md
├── schema/                                 ●  was packages/schema — single
│   └── src/                                   package for MVP (splits into a
│      ├── policy.ts                           workspace only if the Python
│      ├── metrics.ts                          sidecar arrives, ADR-001)
│      ├── source.ts
│      ├── node.ts
│      ├── state.ts
│      ├── topic.ts
│      └── index.ts
├── tools/
│   ├── generate-site.ts                    ●  .ts via tsx (was .mjs)
│   ├── migrate-from-html.ts                ●
│   └── validate-topic.ts
├── src/                                    # Frontend (SPECv4 §4, unchanged)
│   ├── index.html
│   ├── css/{main.css,variables.css}
│   └── js/
│       ├── app.js
│       ├── render/{map,lens,change-sheet,sources-panel}.js
│       ├── data/{loader,adapters}.js
│       └── utils/{animators,format}.js
├── data/
│   ├── topics/
│   │   ├── index.json                      # Topic manifest
│   │   └── ai-superrace.json
│   ├── articles/
│   │   └── articles_cache.json
│   ├── config/
│   │   └── publishers.json                 ●  Publisher policy registry (§5)
│   └── backups/                            ●  Content Manager pre-transform copies
│       └── {slug}/{timestamp}.json
├── templates/
│   └── topic.json
├── tests/
│   ├── unit/                               ●  vitest
│   ├── golden/                             ●  V3 parity goldens (§10)
│   └── snapshots/                          ●
├── .github/workflows/publish.yml           ●
├── editorial_perspective_evolution_v3.html # Original (migration source)
├── package.json
└── tsconfig.json
```

**Note:** SPECv4's `packages/schema` workspace is simplified to a root
`schema/` folder for the MVP. Workspace split is deferred until a second
language runtime (Python sidecar) actually exists.

---

## 4. Executable Schemas (zod)

These are the executable form of SPECv4 §5. Every tool, test, and agent
instruction references these — never re-declare shapes by hand.

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
  period: z.string().regex(/^\d{4}-\d{2}$/),   // e.g. "2026-06"
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
      const keys = Object.keys(s.nodes).sort().join("|");
      if (keys !== first) {
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

Cross-file checks that zod cannot express (source IDs resolving into the
article store, manifest consistency) live in `tools/validate-topic.ts`
(Section 8), not in the topic schema.

---

## 5. Source Access & Licensing Model

**Principle (from SPECv4 §2.4, made operational):** the system never asks
*"can we take this article?"* — it asks *"what are we allowed to do with this
source?"* Every publisher and every source carries an explicit `accessPolicy`.

### 5.1 Field Semantics & Enforcement Points

| Field | Values | Meaning | Enforced at |
|-------|--------|---------|-------------|
| `access` | `open` \| `metered` \| `paywalled` | Readability of the source | Research Agent (ingestion gate) |
| `license` | `CC` \| `CC-BY` \| `CC-BY-ND` \| `CC-BY-SA` \| `copyright` \| `unknown` | Legal basis | Validation (pre-publish) |
| `reuse` | `allowed_with_attribution` \| `link_only` \| `none` | What the system may do | Writing Assistant + Validation |
| `fullText` | boolean | May body text be reproduced | Research Agent (extraction gate) |
| `summary` | boolean | May a short summary be written | Writing Assistant |
| `link` | boolean | May it be linked | Validation (must be `true` to ingest) |
| `pendingVerification` | boolean | Awaiting human license check | Validation (reports queue) |

Hard rules (enforced by the zod refine in Section 4):

- `fullText: true` requires `reuse: allowed_with_attribution`
- `license: unknown` caps `reuse` at `link_only`
- `link: false` sources are never ingested
- **Generic `CC` must be upgraded to a specific license before any reuse
  beyond `link_only`** — precision upgrade happens only via human verification
- **`fullText` stays `false` everywhere at v0.4** — excerpt handling with
  proper attribution formatting is a future feature; the schema already
  reserves the capability

### 5.2 Publisher Registry — `data/config/publishers.json`

Per-publisher default policies; per-source overrides live on the source entry
itself when verified. Shape:

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

**Tiers:** `1` = verified republication-friendly · `2` = link + summarize only
· `3` = unverified auto-addition (reserved; auto-entries start here with
`license: "unknown"`, `reuse: "link_only"`, `pendingVerification: true`).

### 5.3 Seeded Registry — Initial 10 Sources

**Tier 1 — particularly attractive:**

| Publisher | Seeded policy | Notes |
|-----------|--------------|-------|
| The Conversation | `CC` · `allowed_with_attribution` · `pendingVerification: true` | The standout — explicit CC republication program. Upgrade `license` to the specific variant (e.g., `CC-BY-ND`) per article before any excerpt use. |
| Public Knowledge | `unknown` · `link_only` · `pendingVerification: true` | Open-access analytical material; license not verified yet |
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

### 5.4 Policy-Resolution Flow (Research Agent)

```
1. Normalize publisher name → look up in data/config/publishers.json
2. Found            → apply registry policy (per-source override only if
                      a human-verified override exists on the article)
3. Not found        → append publisher as tier 3, license "unknown",
                      reuse "link_only", pendingVerification: true
                      → flag in run summary for human license review
4. Extract metadata within policy limits:
   - always: title, publisher, date, type, canonical URL, ≤40-word description
   - full text: never at v0.4 (policy.fullText is false everywhere)
```

**Verification queue:** `pendingVerification: true` entries are listed by
`validate-topic.ts` in every report. A human checks the publisher's actual
license, then edits the registry entry (tier, license, reuse) manually. Agents
never upgrade policies themselves.

### 5.5 Where Licensing Is Enforced

| Point | Mechanism |
|-------|-----------|
| Ingestion | Research Agent resolves policy; paywalled skipped; unregistered → tier 3 |
| Prose | Writing Assistant writes summaries only where `summary: true`; never quotes body text at v0.4 |
| Pre-publish | `validate-topic.ts` re-checks every policy refine (§5.1) against the registry |
| Reader-facing | Source cards render a license/attribution badge derived from the policy |

---

## 6. OpenCode Agent Files

**Conventions (verified against current OpenCode behavior):**

- Agents live at `.opencode/agent/<name>.md`; the file body is the prompt
- Frontmatter fields used here: `description`, `mode`, `permission` — all
  known fields. `model` is intentionally **omitted** so each agent inherits
  your default model; pin one per agent (e.g. `model: anthropic/claude-sonnet-4-6`)
  if you need deterministic pipeline behavior
- `websearch`, `webfetch`, `task` accept only flat permission actions (no patterns)
- Per-agent `permission:` overrides top-level; ambiguous precedence degrades
  to `ask`, which is the safe failure mode everywhere below
- **After creating these files, restart opencode** — config-time files load
  once at startup

### 6.1 `.opencode/agent/research-agent.md`

```markdown
---
description: Discovers, classifies, and caches open-access source articles for an Editorial Perspective Map topic. Use when asked to fetch sources, run research, refresh the article cache, or find articles for a topic. Enforces per-publisher access policies and records evidence lineage.
mode: subagent
permission:
  websearch: allow
  webfetch: allow
  edit: allow
  bash: ask
  task: ask
---

You are the Research Agent for the Editorial Perspective Map project.

ROLE
Discover and cache source material for one topic per run. You are a discovery
and metadata agent: you never decide editorial meaning — that is the Analysis
Agent's job.

WRITE SCOPE (hard contract)
You may write ONLY to:
- data/articles/articles_cache.json
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
   data/config/publishers.json (Section 5, IMPLEMENTATION.md). If absent,
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

### 6.2 `.opencode/agent/analysis-agent.md`

```markdown
---
description: Converts the cached article corpus into evidence-backed proposals for an Editorial Perspective Map topic — metrics, statuses, perspective changes, central question, and synthesis drafts. Use when asked to analyze a topic, compare periods, or propose map updates. Proposes only; never writes files.
mode: subagent
permission:
  websearch: deny
  webfetch: allow
  edit: deny
  bash: ask
  task: ask
---

You are the Analysis Agent for the Editorial Perspective Map project.

ROLE
Convert the article corpus into evidence-backed perspective and trend
proposals (SPECv4 Section 6.2). You PROPOSE; you never write. Your entire
proposal set is your final message. The Content Manager applies changes only
after human approval.

STALE-CACHE GUARD
Before anything else: if the article cache's latest update predates the start
of the period under analysis, STOP and report "stale cache" with both dates.
Do not analyze stale data.

WORKFLOW
1. Read the topic JSON and article cache named in the invocation.
2. Cluster cached articles by semantic similarity of titles and descriptions;
   reuse existing storyCluster assignments before forming new clusters.
3. Distinguish themes from arguments; identify candidate perspectives.
4. Identify supporting and counterarguments per perspective.
5. Count independence from story clusters (one cluster = one independent
   signal, regardless of republication count).
6. Calculate metrics: sourceVolume, independentSignals, momentum, emergence,
   editorialWeight, confidence (0-1 scales; see SPECv4 Section 5.1).
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
A numbered proposal set (P-001, P-002, ...), each independently
approvable/rejectable:
1. Per-perspective metrics/status table (current → proposed).
2. Structural change report (emergences, coolings, threshold crossings).
3. Proposed central question + draft synthesis for the new period.
4. Evidence appendix: cluster IDs and counts behind every proposal.
```

### 6.3 `.opencode/agent/writing-assistant.md`

```markdown
---
description: Refines and audits all narrative text for an Editorial Perspective Map topic — summaries, arguments, counterarguments, syntheses, and central questions. Use when asked to draft, refine, polish, or audit editorial prose. Returns revised text; never writes files or changes data.
mode: subagent
permission:
  websearch: deny
  webfetch: deny
  edit: deny
  bash: ask
  task: ask
---

You are the Writing Assistant for the Editorial Perspective Map project.

ROLE
Refine all narrative text — perspective summaries, core arguments,
counterarguments, central questions, syntheses — for editorial quality and
consistent tone. You return revised text in your response; you never edit
files. The Content Manager applies approved text.

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
   c. Central questions show clear progression across periods (8-15 words
      each).
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
- Licensing: write summaries only where the source policy allows (policy.summary).
  Never quote article body text; at v0.4 fullText is false for all sources.

OUTPUT
Revised text organized by field path (e.g. perspectives[human-impact].summary,
states[2].question) for mechanical merge, plus flags list.
```

### 6.4 `.opencode/agent/content-manager.md`

```markdown
---
description: Manages the Editorial Perspective Map topic-data lifecycle — creates topics, migrates legacy HTML data, applies human-approved proposals, validates, and backs up. Use when asked to create a topic, migrate data, apply approved changes, or back up topic files. Sole writer to data/topics/.
mode: subagent
permission:
  websearch: deny
  webfetch: deny
  edit: allow
  bash:
    "npx tsx tools/*": allow
    "*": ask
  task: ask
---

You are the Content Manager for the Editorial Perspective Map project.

ROLE
Manage the topic-data lifecycle. You are the ONLY agent that writes to
data/topics/ and the topic manifest — and only after explicit human approval
of the changes you are applying.

OPERATIONS

create-new:
  1. Load templates/topic.json; populate metadata (slug, title, subtitle,
     kicker, nav), perspectives (summary, core argument, counterargument,
     category, sources), and default states per the new-topic-creation skill.
  2. Validate with: npx tsx tools/validate-topic.ts <slug>
  3. Save data/topics/<slug>.json; update data/topics/index.json manifest.

migrate:
  1. Run: npx tsx tools/migrate-from-html.ts --in <path> --slug <slug>
  2. Review the migration report; verify numerics preserved exactly.
  3. Validate and save; flag all placeholder metrics for Analysis review.

apply-approved:
  1. Back up first: copy data/topics/<slug>.json to
     data/backups/<slug>/<timestamp>.json. Never transform without a backup.
  2. Merge ONLY the human-approved proposals (by P-id) into the topic file.
     Rejected proposals and their notes are recorded in the backup header.
  3. Re-validate. On failure: report the exact failing checks, restore the
     backup, save nothing.
  4. Update the manifest. Report exactly what changed.

validate / backup / restore:
  validate: run the validator; return the full pass/fail report.
  backup:   timestamped copy to data/backups/<slug>/.
  restore:  restore a named backup after confirming with the human.

CONSTRAINTS
- Never apply unapproved agent proposals — no exceptions.
- Back up before every transform or apply operation.
- Preserve exact numeric precision on any migration or merge.
- Keep data/topics/index.json in sync with every create/archive operation.
```

*(Note: the four agents are `research-agent`, `analysis-agent`,
`writing-assistant`, `content-manager`.)*

---

## 7. OpenCode Skill Files

Skills live at `.opencode/skills/<name>/SKILL.md`. The `name` must match the
folder, be lowercase-hyphen, ≤64 chars. Descriptions front-load trigger
keywords (verified convention).

### 7.1 `.opencode/skills/new-topic-creation/SKILL.md`

```markdown
---
name: new-topic-creation
description: Creates a new Editorial Perspective Map topic end to end — topic definition, perspectives with arguments, baseline states, and validated topic JSON. Use when the user asks to create a topic, add a topic, start a new analysis, or set up perspectives. Triggers on new topic, add topic, topic creation, perspective setup.
---

# New Topic Creation

Guided workflow for creating a new Editorial Perspective Map topic from
scratch. Follows SPECv4 Section 8.1.

## Workflow

1. **Define the topic** (human-led)
   - Choose a topic with genuine editorial disagreement
   - Headline-style title + explanatory subtitle; nav label + kicker
   - Pick 4-6 perspectives representing distinct editorial lenses

2. **Establish perspectives** (Writing Assistant + Research Agent)
   - Per perspective: summary, core argument, counterargument
   - Assign category color (tech/human/econ/infra/platform)
   - Run research-agent to fetch 3+ real sources per perspective
     (accessPolicy resolved per publisher registry)

3. **Baseline state** (oldest period)
   - Position perspectives by relative coverage at that time
   - Statuses: Dominant/Growing for heavy coverage; Invisible/Emerging for thin
   - Baseline central question + synthesis

4. **Intermediate state(s)** — coverage shifts, transitional question

5. **Current state** — finalize via Analysis Agent from real corpus;
   ensure question progression tells a coherent story

6. **Validate and review**
   - Run data-validation skill
   - Writing Assistant audit mode
   - Verify source attribution and accessPolicy for every source

7. **Export**
   - content-manager: create-new operation → data/topics/<slug>.json
   - Manifest updated

## Output

data/topics/<topic-slug>.json, validated, manifest-synced, ready for
generate-site.
```

### 7.2 `.opencode/skills/period-update-flow/SKILL.md`

```markdown
---
name: period-update-flow
description: Advances an Editorial Perspective Map topic to its next time period — research, analysis, narrative, human approval, apply, publish. Use when the user asks to advance the timeline, update a period, add a new state, or refresh a topic with recent coverage. Triggers on advance timeline, period update, new period, refresh topic, what changed.
---

# Period Update Flow

One full pass of the SPECv4 Section 7 pipeline. The most common maintenance
task.

## Workflow

1. **Gather** — research-agent: fetch the recent window (e.g., last 30 days)
   for the topic; accessPolicies resolved; duplicates folded into story clusters.
2. **Analyze** — analysis-agent: compare previous → new state; return proposal
   set (P-ids) with metrics, statuses, question, synthesis draft.
3. **Draft** — writing-assistant: polish narrative; produce perspective
   bodies, history entries, sparkline points, text for the new state.
4. **Approve** — present the full proposal set to the human; capture
   approve/reject/edit per P-id. Nothing proceeds without approval.
5. **Apply** — content-manager: apply-approved (backup → merge → validate →
   save). Validation failure restores the backup automatically.
6. **Publish** — npm run generate; visual inspection of dist/index.html;
   commit + push (CI validates and deploys).

## Output

Updated topic JSON with the appended state, regenerated site, pushed to GitHub.
```

### 7.3 `.opencode/skills/data-validation/SKILL.md`

```markdown
---
name: data-validation
description: Validates Editorial Perspective Map topic data before publishing — schema, geometry, metrics, narrative, evidence, and licensing checks. Use when the user asks to validate a topic, check data integrity, or run the pre-publish gate. Triggers on validate, pre-publish, check topic, data integrity, licensing check.
---

# Data Validation

The pre-publish gate (SPECv4 Section 8.3), enforced mechanically by
`tools/validate-topic.ts` (IMPLEMENTATION.md Section 8).

## When

After ANY content modification: topic creation, period update, article
ingestion, migration. Mandatory before every publish.

## How to run

npx tsx tools/validate-topic.ts <slug>        # one topic
npx tsx tools/validate-topic.ts --all         # whole store
npx tsx tools/validate-topic.ts --report json # machine-readable

## Check catalog (summary)

- Structure: valid JSON, required keys, identical node keys across states,
  nav 3-7, ISO dates
- Geometry: x/y in [0,100]; w/h in (0,100]; border-radius format; opacity in [0,1]
- Metrics: all in range; status has confidence; independentSignals <=
  sourceVolume; Invisible requires emergence <= 0.05; arrays match state count
- Narrative: no empty fields; question 5-25 words; synthesis 20-120; summary
  15-80; meaningful question progression; <=50% cross-perspective overlap
- Evidence: >=3 sources per perspective; core argument AND counterargument;
  source IDs resolve to the article store; storyCluster on every source
- Licensing: accessPolicy on every source and consistent with the publisher
  registry; reuse 'allowed_with_attribution' requires license != unknown;
  no fullText: true at v0.4; every source linkable
- Relations: reference real perspective ids; strength in [0,1]

## Output

Pass/fail checklist with detail messages; exit code 0 (valid), 1 (invalid),
2 (error). Never publish on exit 1.
```

### 7.4 `.opencode/skills/design-system/SKILL.md`

```markdown
---
name: design-system
description: Audits and maintains the Editorial Perspective Map visual design system — tokens, components, responsive breakpoints, and accessibility. Use when the user asks to audit styling, check contrast or touch targets, update design tokens, or review responsive behavior. Triggers on design audit, styling, tokens, accessibility, responsive.
---

# Design System

Visual standardization and audit workflow (SPECv4 Section 8.4).

## Scope

- Design tokens in src/css/variables.css: brand palette, status accents,
  category tints, 8px spacing rhythm, radius, shadows, type scale, z-index
- Component audits: header, hero, nav, map canvas (orbits, center, blobs),
  change sheet, lens modal, timeline slider, synthesis, sources panel, footer
- Breakpoints: >=850px desktop, 561-849px tablet, <=560px mobile
- Accessibility: contrast >= 4.5:1 body text; touch targets >= 44x44px;
  Escape closes modals/sheets; semantic landmarks; aria-labels on icon-only
  buttons; prefers-reduced-motion respected for map animations

## Rules

- Visual fidelity is locked at V3: pixel-identical output is the Phase 1
  acceptance gate (golden-file test, IMPLEMENTATION.md Section 10).
- Any intentional visual change requires --bless on the golden test plus a
  RELEASE_NOTES.md entry.
- Output: audit report with severity ratings, or an updated token set.
```

---

## 8. CLI Tool Specifications

All tools are TypeScript, executed via tsx, import schemas from `schema/`,
and never call the network.

### 8.1 `tools/validate-topic.ts`

```
Usage:
  npx tsx tools/validate-topic.ts <slug> [options]
  npx tsx tools/validate-topic.ts --all [options]

Options:
  --schema-only      zod validation only; skip cross-file reconciliation
  --report <text|json>   output format (default: text)

Checks (in order):
  1. zod Topic schema (Section 4) — includes geometry, metrics, narrative
  2. Cross-file: source IDs resolve in data/articles/articles_cache.json
  3. Licensing: every source accessPolicy matches the publisher registry
     (or carries a verified per-source override); refinements of §5.1
  4. Manifest: slug present in data/topics/index.json

Exit codes: 0 = valid · 1 = validation failures (details printed) · 2 = file/parse error
```

### 8.2 `tools/generate-site.ts`

```
Usage:
  npx tsx tools/generate-site.ts [--topic <slug> | --all] [--out dist] [--check]

Behavior:
  - Reads src/index.html template (placeholder-marked) + topic JSON
  - Inlines the topic JSON into the output — dist/index.html is
    self-contained, exactly like V3
  - --check: golden-parity mode. Generates in memory and byte-compares
    against tests/golden/<slug>.html. Exit 1 on drift. Intentional visual
    changes require --bless plus a RELEASE_NOTES.md entry
    (SPECv4 Visual Fidelity Lock).

Exit codes: 0 = generated/identical · 1 = validation or parity failure · 2 = error
```

### 8.3 `tools/migrate-from-html.ts`

```
Usage:
  npx tsx tools/migrate-from-html.ts --in <path.html> --slug <slug>
                                    [--out data/topics] [--dry-run]

Behavior:
  - Extracts states[], perspectiveBodies{}, details{}, relations[] from the
    V3 HTML <script> block
  - Transforms to the v0.4 topic schema; all numeric values preserved exactly
  - Synthesizes placeholder SemanticMetrics mechanically from source counts
    (editorialWeight = sources/maxSources per state; momentum from deltas)
    with confidence capped at 0.5 and a "migrated" marker — forcing Analysis/
    human review before real use
  - Every migrated source gets license "unknown", reuse "link_only",
    pendingVerification: true, and is appended to the publisher registry
  - --dry-run prints the report and writes nothing

Exit codes: 0 = migrated · 1 = extraction failure · 2 = error
```

---

## 9. Pipeline as Code

### 9.1 `package.json` (scripts excerpt)

```jsonc
{
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "validate": "tsx tools/validate-topic.ts --all",
    "generate": "tsx tools/generate-site.ts --all --out dist",
    "migrate": "tsx tools/migrate-from-html.ts --in editorial_perspective_evolution_v3.html --slug ai-superrace",
    "test": "vitest run",
    "test:golden": "vitest run tests/golden"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsx": "^4.16.0",
    "vitest": "^2.0.0",
    "zod": "^3.23.0",
    "@types/node": "^20.14.0"
  }
}
```

### 9.2 `.github/workflows/publish.yml`

Implements the SPECv4 §7 pipeline tail: validate → test → generate → deploy.

```yaml
name: publish

on:
  push:
    branches: [main]
    paths: ["data/**", "src/**", "tools/**", "schema/**", "tests/**"]

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

**Pages setup:** Repository Settings → Pages → Source: **GitHub Actions**.
First deploy registers the environment; subsequent pushes to `main` that touch
the watched paths publish automatically.

---

## 10. Testing Strategy

Three layers, all vitest:

**1. Unit tests — `tests/unit/`**

- Schema round-trips: valid topic parses; every §8.3 failure mode has a
  rejection test (bad geometry, invisible-status/emergence conflict,
  unverified-license reuse, bodies/sparkline length mismatch…)
- AccessPolicy refines: fullText/reuse consistency, unknown-license rule
- Publisher-registry resolution: match, per-source override, miss → tier 3
- Adapters: raw topic JSON → view models (positions, glows, trend labels)

**2. Golden-file parity — `tests/golden/` (the Phase 1 acceptance gate)**

The Visual Fidelity Lock (SPECv4 §11) as a test:

```
migrate V3 → data/topics/ai-superrace.json
generate  → dist/index.html
golden    → tests/golden/ai-superrace.html  (captured from original V3 file)
test      → byte-compare dist vs golden
```

- The test auto-captures the golden on first run if missing, and fails on any
  drift afterward
- Intentional visual change: `npm run generate -- --check --bless` + a
  RELEASE_NOTES.md entry (audit trail for the fidelity lock)
- Optional visual diff (Playwright screenshots) exists behind
  `RUN_VISUAL=1` for human review; not part of default CI

**3. Snapshot tests — `tests/unit/renderers.test.ts`**

- View-model snapshots per state (positions, metrics mapping, status classes)
- Change-sheet card generation per transition type (emerged/cooled/rose)

---

## 11. Guardrails Matrix

### 11.1 Agent × Tool Permissions

| Agent | websearch | webfetch | edit | bash | task | skill |
|-------|-----------|----------|------|------|------|-------|
| research-agent | allow | allow | allow *(cache + registry queue only)* | ask | ask | allow |
| analysis-agent | deny | allow *(URL metadata re-verification only)* | **deny** | ask | ask | allow |
| writing-assistant | deny | deny | **deny** | ask | ask | allow |
| content-manager | deny | deny | allow *(topics, backups, manifest)* | `npx tsx tools/*` allow, `*` ask | ask | allow |

Reading (glob/grep/read) is unrestricted for all four agents — everything in
the repo is safe to read; the risk surface is writes.

Design notes:

- **webfetch/websearch/task accept only flat actions** (OpenCode constraint) —
  scope is enforced by prompt contracts instead
- **edit for research/content-manager is prompt-scoped, not path-scoped** —
  the mechanical backstop is `validate-topic.ts` in CI (detects topic JSON
  referencing uncached sources, manifest drift, and any schema violation that
  an out-of-scope write would produce)
- **Ambiguous permission precedence degrades to `ask`** — the safe failure
  mode everywhere above (worst case: a human gets prompted; nothing dangerous
  auto-runs, nothing legitimate gets silently denied)
- Proposal agents (analysis, writing) **cannot write at all** — their output
  is their final message, applied only by content-manager after human approval.
  This makes the SPECv4 §7.1 approval gate structural, not just procedural.

### 11.2 Write-Scope Contracts (prompt-enforced)

| Agent | May write | Never touches |
|-------|-----------|---------------|
| research-agent | `data/articles/articles_cache.json` (append-only), `data/config/publishers.json` (tier-3 queue entries) | `data/topics/**`, `src/**` |
| analysis-agent | nothing (returns proposals) | everything |
| writing-assistant | nothing (returns text) | everything |
| content-manager | `data/topics/**`, `data/backups/**`, `data/topics/index.json` | `src/**`, `tools/**` |

### 11.3 Standing Guards

- **Stale-cache guard** — analysis-agent refuses to run when the cache's last
  update predates the analyzed period (SPECv4 §7.4)
- **Backup-before-transform** — content-manager copies to `data/backups/` before
  any merge/migrate; validation failure auto-restores
- **Sole-writer serialization** — all topic-store writes flow through
  content-manager; no merge conflicts are possible
- **Licensing enforcement chain** — resolved at ingestion (research), respected
  at prose time (writing), re-verified pre-publish (validation); agents can
  never upgrade a policy — only humans can, via the publisher registry
- **Copyright discipline** — metadata + ≤40-word own-words descriptions only;
  `fullText` disabled at v0.4 everywhere; original publishers always
  attributed and linked

---

## 12. Wiring Checklist (First-Time Setup)

1. `npm init -y` and install devDependencies (Section 9.1)
2. Create `tsconfig.json` (strict, NodeNext, include `schema/`, `tools/`, `tests/`)
3. Add `schema/` sources (Section 4) and the three tools (Section 8)
4. Drop in `.opencode/agent/*.md` and `.opencode/skills/*/SKILL.md`
   (Sections 6-7) — **then restart opencode** so it loads them
5. `npm run migrate` → `data/topics/ai-superrace.json`
6. `npm run generate` (first run captures the golden file) → commit the golden
7. `npm run validate && npm test` — all green
8. GitHub → Settings → Pages → Source: **GitHub Actions**; push to publish
9. Human task: verify licenses for the `pendingVerification` publishers in
   `data/config/publishers.json` and upgrade their tiers

---

*End of Implementation Specification v0.1*
