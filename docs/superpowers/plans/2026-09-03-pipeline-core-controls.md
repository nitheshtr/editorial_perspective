# Pipeline Core Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the v0.2 spec's core controls: §11 config migration, the §8 quality gate, budget fallback with `flagDegradedAnalysis` propagation, and additive argument `momentumScore`.

**Architecture:** Config moves to the §11 key shape with all readers updated in one commit. A new pure `pipeline/src/quality.ts` module implements the four editorial gate rules, invoked by the `validate` stage after `validateTopic`. The budget guard gains a `fallback_to_fast_model` action that routes remaining calls to the stage failover model and marks run artifacts `degraded: true`, which validate blocks on unless the human approval record accepts it. `momentumScore` (0–1) lands additively beside the shipped categorical argument momentum.

**Tech Stack:** TypeScript (strict), zod 3, bun runtime (`bun test` is the working runner — `bunx vitest` cannot load suites in this environment), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-03-pipeline-core-controls-design.md`

## Global Constraints

- Runtime is **bun**; there is NO `node` on PATH. Run TS with `bun <file.ts>`, tests with `bun test`, typecheck with `bunx tsc --noEmit`.
- Shell is Windows PowerShell 5.1: never use `&&` — use `;` or `if ($?) { ... }`.
- Test runner is `bun test` (vitest suite-load fails in this environment; do not chase it).
- Golden parity: do NOT modify `tests/golden/ai-superrace.html` — no task in this plan changes emission output for existing data (momentumScore is absent from all current data, so no drift).
- Keep `actionOnExceed: "halt"` as the committed default; `"fallback_to_fast_model"` is opt-in.
- All new config blocks must have real readers — no inert config.
- Commit after every task; use descriptive messages matching repo style (no conventional-commit prefixes — repo uses plain descriptive subjects).

---

### Task 1: Config migration to §11 shape

**Files:**
- Modify: `config/pipeline.json`
- Modify: `pipeline/src/agent.ts` (model key mapping, if agent frontmatter carries `models.analysis`)
- Modify: `agents/analysis-agent.md`, `agents/research-agent.md`, `agents/writing-assistant.md` (frontmatter `model:` field only, if present)
- Modify: `pipeline/src/runner.ts` (budget reads at lines ~800 and ~917)
- Test: `tests/pipeline/config.test.ts` (create)

**Interfaces:**
- Consumes: current `loadConfig()` in `runner.ts:45-47` (unchanged path).
- Produces: config shape consumed by Tasks 2–4 — `config.models.{research,analysis,writing,apply}` each `{provider, model, temperature, reasoning}`, `config.budget.{maxCostPerRun, actionOnExceed, flagDegradedAnalysis}`, `config.concurrency.maxParallel`, `config.quality` (Task 2), `config.failover` keyed by **actual model name** (providers already do `failover?.[req.model]`), `config.sources`, `config.cache`, `config.publication`.

- [ ] **Step 1: Write the failing config-reader test**

```ts
// tests/pipeline/config.test.ts
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("config/pipeline.json", "utf-8"));

describe("pipeline config (§11 shape)", () => {
  it("uses nested stage model keys", () => {
    expect(config.models.analysis).toBeDefined();
    expect(config.models.analysis.provider).toBe("openrouter");
    expect(config.models["models.analysis"]).toBeUndefined();
  });
  it("uses new budget keys with halt default and degraded flag", () => {
    expect(config.budget.maxCostPerRun).toBe(0.10);
    expect(config.budget.actionOnExceed).toBe("halt");
    expect(config.budget.flagDegradedAnalysis).toBe(true);
    expect(config.budget.maxCostUsdPerRun).toBeUndefined();
  });
  it("uses concurrency.maxParallel", () => {
    expect(config.concurrency.maxParallel).toBe(4);
    expect(config.concurrency.maxParallelFetches).toBeUndefined();
  });
  it("has quality, sources, cache, publication blocks", () => {
    expect(config.quality.minimumConfidence).toBe(0.70);
    expect(config.quality.minimumIndependentSources).toBe(3);
    expect(config.quality.maximumSinglePerspectiveShare).toBe(0.45);
    expect(config.quality.maximumSinglePerspectiveShareBasis).toBe("independentSignals");
    expect(config.quality.requireEvidenceForPerspective).toBe(true);
    expect(config.quality.requireCounterargument).toBe(false);
    expect(config.sources.search.provider).toBe("tavily");
    expect(config.sources.rss.registry).toBe("config/sources.json");
    expect(config.cache.enabled).toBe(true);
    expect(config.publication.requireHumanApproval).toBe(true);
    expect(config.publication.autoPublish).toBe(false);
  });
  it("retains failover keyed by actual model name and runtime extensions", () => {
    expect(config.failover[config.models.analysis.model]).toBeDefined();
    expect(config.defaults.maxTokens).toBeDefined();
    expect(config.defaults.timeoutMs).toBeDefined();
    expect(config.telemetry.sink).toBe("jsonl");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/pipeline/config.test.ts`
Expected: FAIL (old key names).

- [ ] **Step 3: Rewrite `config/pipeline.json` to §11 shape**

```json
{
  "models": {
    "research": { "provider": "openrouter", "model": "z-ai/glm-5.3-flash", "temperature": 0.2, "reasoning": "low" },
    "analysis": { "provider": "openrouter", "model": "z-ai/glm-5.3-flash", "temperature": 0.3, "reasoning": "low" },
    "writing": { "provider": "openrouter", "model": "z-ai/glm-5.3-flash", "temperature": 0.4, "reasoning": "low" },
    "apply": { "provider": "openrouter", "model": "z-ai/glm-5.3-flash", "temperature": 0.1, "reasoning": "low" }
  },
  "defaults": { "maxTokens": 32768, "timeoutMs": 120000 },
  "failover": { "z-ai/glm-5.3-flash": ["z-ai/glm-5.3-flash"] },
  "sources": {
    "rss": { "enabled": true, "registry": "config/sources.json" },
    "search": { "provider": "tavily", "maxResults": 10 }
  },
  "quality": {
    "minimumConfidence": 0.70,
    "minimumIndependentSources": 3,
    "maximumSinglePerspectiveShare": 0.45,
    "maximumSinglePerspectiveShareBasis": "independentSignals",
    "requireEvidenceForPerspective": true,
    "requireCounterargument": false
  },
  "budget": { "maxCostPerRun": 0.10, "actionOnExceed": "halt", "flagDegradedAnalysis": true },
  "retry": { "maxAttempts": 3, "backoffMs": 2000 },
  "concurrency": { "maxParallel": 4 },
  "cache": { "enabled": true, "rssTtlMinutes": 30, "searchTtlHours": 6, "analysisTtlHours": 24 },
  "publication": { "requireHumanApproval": true, "autoPublish": false },
  "telemetry": { "sink": "jsonl", "dir": "data/telemetry" },
  "artifacts": { "sink": "git", "readOnly": false, "dirs": { "bucket": "", "prefix": "runs/" } }
}
```

(Reasoning stays `"low"` — current models need it; the §11 `"high"` is a placeholder value for a stronger model we don't route to yet.)

- [ ] **Step 4: Update all readers**

- `runner.ts` `getProviderForModel(modelKey)` unchanged — but agent frontmatter `model:` values change from `models.analysis` → `analysis` etc. Grep `agents/*.md` for `model:` and update; grep `pipeline/src/agent.ts` for any hardcoded `models.` strings and update.
- Budget reads (runner.ts:801, 918): `const maxCost = (budget?.maxCostPerRun as number) ?? Infinity;`
- Grep the whole repo for `maxCostUsdPerRun|maxParallelFetches|"models\.` and fix every hit (including tests/pipeline/budget.test.ts and providers tests using failover keys).
- `sources.search` reads: grep `config.search` / `.search?.provider` / `maxResults` in `runner.ts` research stage and update to `sources.search`.
- Thin RSS-registry reader (spec §3 — no inert config): in the research stage's RSS loading, read the registry path from `config.sources.rss.registry` (default `"config/sources.json"`); if that file does not exist on disk, fall back to the current `data/config/feeds.json`. Existing feeds.json keeps working unchanged since `config/sources.json` is not created in this slice.

- [ ] **Step 5: Run tests + typecheck**

Run: `bun test tests/pipeline/config.test.ts; bun test; bunx tsc --noEmit`
Expected: config test PASS, full suite at the established baseline (93 pass / 4 pre-existing env failures), tsc clean.

- [ ] **Step 6: Commit**

```bash
git add config/pipeline.json pipeline/src agents tests/pipeline/config.test.ts
git commit -m "Pipeline config migrates to v0.2 §11 shape: nested stage models, maxCostPerRun + flagDegradedAnalysis, concurrency.maxParallel, quality/sources/cache/publication blocks; readers and failover keys updated"
```

---

### Task 2: Quality gate module + validate-stage wiring

**Files:**
- Create: `pipeline/src/quality.ts`
- Modify: `pipeline/src/runner.ts` (`stageValidate`, lines ~1129–1156)
- Test: `tests/pipeline/quality.test.ts` (create)

**Interfaces:**
- Consumes: Task 1's `config.quality` shape; topic JSON shape `states[n].nodes[<name>].metrics.{confidence, independentSignals}`.
- Produces: `runQualityGate(topic: Record<string, unknown>, quality: Record<string, unknown> | undefined): { ok: boolean; violations: QualityViolation[] }` where `QualityViolation = { rule: string; perspective?: string; value: number; threshold: number; message: string }`. Task 4 consumes the same module's `checkDegradedArtifact`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/pipeline/quality.test.ts
import { describe, it, expect } from "bun:test";
import { runQualityGate } from "../../pipeline/src/quality.js";

const node = (confidence: number, signals: number) => ({
  metrics: { confidence, independentSignals: signals },
});
const topic = (nodes: Record<string, unknown>) => ({
  states: [{ nodes }],
});
const QUALITY = {
  minimumConfidence: 0.70,
  minimumIndependentSources: 3,
  maximumSinglePerspectiveShare: 0.45,
  maximumSinglePerspectiveShareBasis: "independentSignals",
  requireEvidenceForPerspective: true,
  requireCounterargument: false,
};

describe("runQualityGate", () => {
  it("passes a healthy topic", () => {
    const t = topic({
      A: node(0.85, 9), B: node(0.8, 7), C: node(0.75, 5),
    });
    expect(runQualityGate(t, QUALITY).ok).toBe(true);
  });
  it("violates minimumConfidence per perspective", () => {
    const t = topic({ A: node(0.42, 9), B: node(0.8, 7) });
    const r = runQualityGate(t, QUALITY);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === "minimumConfidence" && v.perspective === "A")).toBe(true);
  });
  it("violates minimumIndependentSources", () => {
    const t = topic({ A: node(0.86, 2), B: node(0.8, 7) });
    const r = runQualityGate(t, QUALITY);
    expect(r.violations.some((v) => v.rule === "minimumIndependentSources")).toBe(true);
  });
  it("computes single-perspective share from independentSignals, not volume", () => {
    // A holds 12 of 13 total signals = 0.923 > 0.45 even though syndicated volume is huge.
    const t = { states: [{ nodes: {
      A: { metrics: { confidence: 0.9, independentSignals: 12, sourceVolume: 26 } },
      B: { metrics: { confidence: 0.9, independentSignals: 1 } },
    }}]};
    const r = runQualityGate(t, QUALITY);
    expect(r.ok).toBe(false);
    const v = r.violations.find((x) => x.rule === "maximumSinglePerspectiveShare");
    expect(v).toBeDefined();
    expect(v!.value).toBeCloseTo(12 / 13);
  });
  it("no share violation when denominator is zero", () => {
    const t = topic({ A: node(0.9, 0), B: node(0.9, 0) });
    const r = runQualityGate(t, QUALITY);
    expect(r.violations.some((v) => v.rule === "maximumSinglePerspectiveShare")).toBe(false);
  });
  it("requireCounterargument=false passes placeholder counterArguments", () => {
    const t = { states: [{ nodes: { A: { ...node(0.9, 9), counterArgument: "Migrated placeholder — pending Analysis Agent review." } } }] };
    expect(runQualityGate(t, { ...QUALITY, requireCounterargument: false }).ok).toBe(true);
  });
  it("requireCounterargument=true fails placeholder but passes real counterArgument or down argument", () => {
    const placeholder = { states: [{ nodes: { A: { ...node(0.9, 9), counterArgument: "Migrated placeholder — pending Analysis Agent review." } } }] };
    expect(runQualityGate(placeholder, { ...QUALITY, requireCounterargument: true }).ok).toBe(false);
    const real = { states: [{ nodes: { A: { ...node(0.9, 9), counterArgument: "Some argue models commoditize and platforms lose pricing power." } } }] };
    expect(runQualityGate(real, { ...QUALITY, requireCounterargument: true }).ok).toBe(true);
    const viaDownArg = { states: [{ nodes: { A: { ...node(0.9, 9), arguments: [{ id: "arg-x-1", statement: "Scale is fading as a story.", momentum: "down", sources: ["source-001"] }] } } }] };
    expect(runQualityGate(viaDownArg, { ...QUALITY, requireCounterargument: true }).ok).toBe(true);
  });
  it("evaluates only the latest state", () => {
    const t = { states: [
      { nodes: { A: node(0.1, 1) } },           // bad old state — ignored
      { nodes: { A: node(0.9, 9), B: node(0.9, 9) } },
    ]};
    expect(runQualityGate(t, QUALITY).ok).toBe(true);
  });
  it("missing quality config passes by default", () => {
    expect(runQualityGate(topic({ A: node(0.1, 0) }), undefined).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/pipeline/quality.test.ts`
Expected: FAIL — module `pipeline/src/quality.ts` does not exist.

- [ ] **Step 3: Implement `pipeline/src/quality.ts`**

```ts
/**
 * pipeline/src/quality.ts — editorial quality gate (spec v0.2 §8)
 * Pure functions; no I/O. Invoked by the validate stage after validateTopic.
 */

export interface QualityViolation {
  rule: string;
  perspective?: string;
  value: number;
  threshold: number;
  message: string;
}

export interface QualityGateResult {
  ok: boolean;
  violations: QualityViolation[];
}

interface NodeMetrics {
  confidence?: number;
  independentSignals?: number;
}

const PLACEHOLDER_PATTERN = /^Migrated placeholder/i;

function latestStateNodes(topic: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const states = (topic.states as Array<Record<string, unknown>> | undefined) ?? [];
  const last = states[states.length - 1];
  return ((last?.nodes as Record<string, Record<string, unknown>>) ?? {});
}

export function runQualityGate(
  topic: Record<string, unknown>,
  quality: Record<string, unknown> | undefined,
): QualityGateResult {
  const violations: QualityViolation[] = [];
  if (!quality) return { ok: true, violations };

  const minConfidence = quality.minimumConfidence as number | undefined;
  const minSignals = quality.minimumIndependentSources as number | undefined;
  const maxShare = quality.maximumSinglePerspectiveShare as number | undefined;
  const requireCounter = quality.requireCounterargument as boolean | undefined;

  const nodes = latestStateNodes(topic);

  // Pass 1: per-perspective thresholds.
  for (const [name, nodeVal] of Object.entries(nodes)) {
    const metrics = (nodeVal.metrics ?? {}) as Record<string, unknown>;
    if (minConfidence !== undefined && typeof metrics.confidence === "number" && metrics.confidence < minConfidence) {
      violations.push({ rule: "minimumConfidence", perspective: name, value: metrics.confidence, threshold: minConfidence,
        message: `Perspective "${name}" confidence ${metrics.confidence} < ${minConfidence}` });
    }
    if (minSignals !== undefined && typeof metrics.independentSignals === "number" && metrics.independentSignals < minSignals) {
      violations.push({ rule: "minimumIndependentSources", perspective: name, value: metrics.independentSignals, threshold: minSignals,
        message: `Perspective "${name}" independentSignals ${metrics.independentSignals} < ${minSignals}` });
    }
    if (requireCounter) {
      const counter = nodeVal.counterArgument as string | undefined;
      const args = (nodeVal.arguments as Array<{ momentum?: string }> | undefined) ?? [];
      const hasDownArg = args.some((a) => a.momentum === "down");
      const realCounter = typeof counter === "string" && counter.trim() !== "" && !PLACEHOLDER_PATTERN.test(counter.trim());
      if (!realCounter && !hasDownArg) {
        violations.push({ rule: "requireCounterargument", perspective: name, value: 0, threshold: 1,
          message: `Perspective "${name}" has no real counterargument (placeholder or missing)` });
      }
    }
  }

  // Pass 2: concentration share, basis = independentSignals (spec §8 fix).
  if (maxShare !== undefined) {
    const signals = new Map<string, number>();
    let total = 0;
    for (const [name, nodeVal] of Object.entries(nodes)) {
      const s = (nodeVal.metrics as Record<string, unknown> | undefined)?.independentSignals;
      if (typeof s === "number") { signals.set(name, s); total += s; }
    }
    if (total > 0) {
      for (const [name, s] of signals) {
        const share = s / total;
        if (share > maxShare) {
          violations.push({ rule: "maximumSinglePerspectiveShare", perspective: name, value: share, threshold: maxShare,
            message: `Perspective "${name}" holds ${(share * 100).toFixed(1)}% of independent signals (cap ${maxShare * 100}%)` });
        }
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
```

- [ ] **Step 4: Run quality tests to green**

Run: `bun test tests/pipeline/quality.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Wire into `stageValidate` (runner.ts)**

After the existing `validateTopic` result handling and before `telemetry.stageEnd`, add:

```ts
  const qualityCfg = ctx.config.quality as Record<string, unknown> | undefined;
  const gate = runQualityGate(topic as Record<string, unknown>, qualityCfg);
  telemetry.emit({
    event: "quality_gate",
    stage: "validate",
    data: { ok: gate.ok, violations: gate.violations.map((v) => v.message) },
  });
```

Change the stage-end failure condition to combine both: `const failed = !result.ok || !gate.ok;` — emit `stageEnd("validate", { ok: !failed })` and `if (failed) { process.exit(1); }` (print `gate.violations.map(v => v.message).join("\n")` to stderr first). Import `runQualityGate` at the top of runner.ts. Note `stageValidate` currently receives only `ctx` — it already has `ctx.config` (RunContext) and `ctx.runId`.

Also in `stageValidate`, assert the publication gate per spec §3 (config-driven flow assertion, not a quality-gate rule):

```ts
  const publication = (ctx.config.publication ?? {}) as Record<string, unknown>;
  if (publication.autoPublish === true) {
    console.error("publication.autoPublish=true is not permitted (v0.2 §3: publication is approval-gated)");
    process.exit(1);
  }
  telemetry.emit({ event: "publication_gate", stage: "validate", data: { requireHumanApproval: publication.requireHumanApproval !== false } });
```

(The apply stage already hard-requires an approval record; this makes the config value load-bearing and refuses a future `autoPublish` bypass.)

- [ ] **Step 6: Full suite + typecheck**

Run: `bun test; bunx tsc --noEmit; bun run tools/validate-topic.ts --all`
Expected: baseline pass count + new quality tests; tsc clean; all topics validate (current ai-superrace Technology confidence 0.8, signals 20 — must pass the 0.70/3 gates with requireCounterargument false).

- [ ] **Step 7: Commit**

```bash
git add pipeline/src/quality.ts pipeline/src/runner.ts tests/pipeline/quality.test.ts
git commit -m "Quality gate (v0.2 §8): min confidence, min independent sources, independentSignals-basis concentration share, optional counterargument rule; wired into validate stage"
```

---

### Task 3: momentumScore — schema, validator, agent contract, emitter pass-through

**Files:**
- Modify: `schema/src/topic.ts` (arguments object)
- Modify: `tools/validate-topic.ts` (arguments check)
- Modify: `agents/analysis-agent.md` (arguments step)
- Modify: `tools/generate-site.ts` (arg emission ~line 327)
- Test: `tests/unit/validate-topic.test.ts` (extend), `tests/unit/schema.test.ts` (extend)

**Interfaces:**
- Consumes: existing `arguments` array on Perspective (Wave-2).
- Produces: `arguments[n].momentumScore?: number (0–1)`; contradiction rule: present score with label `down` and score ≥ 0.5 → fail; label `up` and score < 0.5 → fail. Emitter adds `momentumScore:<n>` to argument payload only when present (no golden drift — no data carries it yet).

- [ ] **Step 1: Write the failing tests**

In `tests/unit/validate-topic.test.ts`, following the existing arguments-check test pattern (fixture builder in that file):

```ts
it("passes arguments check with valid momentumScore", () => {
  // fixture topic with an argument carrying momentumScore: 0.8, momentum: "up"
  // build via the file's existing valid-topic helper + arguments array
  const result = await validateTopic({ topic: withArgs([{ id: "arg-x-1", statement: "Valid statement here.", momentum: "up", momentumScore: 0.8, sources: ["source-001"] }]), ... });
  expect(check(result, "arguments").status).toBe("pass");
});
it("fails arguments check when momentumScore out of range", () => {
  // momentumScore: 1.5 → schema rejects; validator reports fail
});
it("fails arguments check when momentumScore contradicts label", () => {
  // momentumScore: 0.2 with momentum: "up" → fail
  // momentumScore: 0.9 with momentum: "down" → fail
});
```

(Use the file's actual fixture helpers — read them first; mirror the existing "fails arguments check when an argument sources a source not in the perspective" test.)

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/unit/validate-topic.test.ts`
Expected: new cases FAIL (momentumScore stripped/ignored by schema today).

- [ ] **Step 3: Schema + validator + contract + emitter**

- `schema/src/topic.ts` arguments object: add `momentumScore: z.number().min(0).max(1).optional(),`
- `tools/validate-topic.ts` arguments check: after existing per-argument checks, if `typeof arg.momentumScore === "number"`: require `(arg.momentum === "up" && arg.momentumScore >= 0.5) || (arg.momentum === "down" && arg.momentumScore < 0.5)`, else push fail detail `perspectives[i].arguments[j]: momentumScore <x> contradicts momentum "<label>"`.
- `agents/analysis-agent.md` arguments step: append one line — "Also emit `momentumScore` (float 0–1) per argument: the cluster attention delta across the period, normalized. Score is the source of truth; the up/down label must agree with it (score ≥ 0.5 ⇒ up)."
- `tools/generate-site.ts` arg emission (line ~327): build the score field conditionally —
  `const scoreField = typeof arg.momentumScore === "number" ? `,momentumScore:${arg.momentumScore}` : "";`
  and insert `scoreField` before the closing brace of the emitted argument object.

- [ ] **Step 4: Run tests + full gates**

Run: `bun test tests/unit; bun test; bunx tsc --noEmit; bun run tools/validate-topic.ts --all; bunx vitest run tests/golden/parity.test.ts`
Expected: all pass; golden parity PASS (no data carries momentumScore → zero emission drift).

- [ ] **Step 5: Commit**

```bash
git add schema/src/topic.ts tools/validate-topic.ts agents/analysis-agent.md tools/generate-site.ts tests/unit
git commit -m "Argument momentumScore (v0.2 §6 fix): numeric 0-1 score as rollup source of truth beside categorical momentum label, contradiction-checked in validator, emitted when present, analysis contract updated"
```

---

### Task 4: Budget fallback + flagDegradedAnalysis propagation

**Files:**
- Modify: `pipeline/src/runner.ts` (budget checks at ~800 and ~917; proposals persistence at ~877; `stageValidate`)
- Modify: `pipeline/src/quality.ts` (add `checkDegradedArtifact`)
- Test: `tests/pipeline/budget.test.ts` (extend), `tests/pipeline/quality.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1's `budget.{maxCostPerRun, actionOnExceed, flagDegradedAnalysis}`, `config.failover` keyed by model name (providers already resolve `failover[req.model]`), `telemetry.costSoFar()`.
- Produces: helper `resolveBudgetAction(budget, spent): "ok" | "warn" | "halt" | "fallback"` (exported for tests); degraded runs persist `analysis/proposals.json` with top-level `degraded: true`; `checkDegradedArtifact(runDir: string): boolean` (new export) used by validate.

- [ ] **Step 1: Write the failing tests**

In `tests/pipeline/budget.test.ts` (mirror its existing fake-provider/telemetry patterns — read it first):

```ts
describe("budget fallback_to_fast_model", () => {
  it("resolveBudgetAction returns halt above limit when action is halt", () => {
    expect(resolveBudgetAction({ maxCostPerRun: 0.1, actionOnExceed: "halt" }, 0.2)).toBe("halt");
  });
  it("resolveBudgetAction returns fallback when configured and over limit", () => {
    expect(resolveBudgetAction({ maxCostPerRun: 0.1, actionOnExceed: "fallback_to_fast_model" }, 0.2)).toBe("fallback");
  });
  it("returns warn between 20% and 100%, ok below", () => {
    const b = { maxCostPerRun: 0.1, actionOnExceed: "halt" };
    expect(resolveBudgetAction(b, 0.05)).toBe("ok");
    expect(resolveBudgetAction(b, 0.05 * 1)).toBe("ok");
    expect(resolveBudgetAction(b, 0.021)).toBe("warn");
  });
});
```

In `tests/pipeline/quality.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("checkDegradedArtifact", () => {
  const withRun = (body: string | null, fn: (dir: string) => void) => {
    const dir = mkdtempSync(join(tmpdir(), "run-"));
    if (body !== null) {
      mkdirSync(join(dir, "analysis"), { recursive: true });
      writeFileSync(join(dir, "analysis", "proposals.json"), body, "utf-8");
    }
    try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
  };

  it("detects degraded flag in proposals.json", () => {
    withRun(JSON.stringify({ degraded: true, proposals: [] }), (dir) => {
      expect(checkDegradedArtifact(dir)).toBe(true);
    });
  });
  it("returns false when not marked", () => {
    withRun(JSON.stringify({ proposals: [] }), (dir) => {
      expect(checkDegradedArtifact(dir)).toBe(false);
    });
  });
  it("returns false when no artifact exists", () => {
    withRun(null, (dir) => {
      expect(checkDegradedArtifact(dir)).toBe(false);
    });
  });
  it("returns false on malformed JSON", () => {
    withRun("{not json", (dir) => {
      expect(checkDegradedArtifact(dir)).toBe(false);
    });
  });
});
```

And a validate-stage integration test: a run whose proposals.json has `degraded: true` produces a `degraded_analysis` violation (call the exported gate helper with a synthetic topic + artifact path).

- [ ] **Step 2: Run to verify failures**

Run: `bun test tests/pipeline/budget.test.ts tests/pipeline/quality.test.ts`
Expected: FAIL (helpers not exported / not implemented).

- [ ] **Step 3: Implement in runner.ts + quality.ts**

runner.ts — replace both inline budget blocks (analysis ~800, writing ~917) with the shared helper:

```ts
export type BudgetAction = "ok" | "warn" | "halt" | "fallback";
export function resolveBudgetAction(budget: Record<string, unknown> | undefined, spent: number): BudgetAction {
  const maxCost = (budget?.maxCostPerRun as number) ?? Infinity;
  const action = (budget?.actionOnExceed as string) ?? "halt";
  if (spent >= maxCost) return action === "fallback_to_fast_model" ? "fallback" : "halt";
  if (maxCost !== Infinity && spent >= maxCost * 0.2) return "warn";
  return "ok";
}
```

At each call site: `warn` → emit the existing warn event; `halt` → existing GuardError; `fallback` → emit `{ event: "llm_degraded", stage, data: { spentUsd, limitUsd, routedTo: failoverModel } }` and complete with the **failover model**: look up `ctx.config.failover?.[modelName]?.[0]`; if none exists, fall through to `halt` (a fallback that has nowhere to go must not silently continue on the expensive model). Track a local `degradedRun = true` when a fallback call happens.

Proposals persistence (analysis stage, ~877): when `degradedRun`, write the artifact as

```ts
JSON.stringify({ degraded: true, ...(result.success ? result.data : { proposals }) }, null, 2) + "\n"
```

and gate on `budget.flagDegradedAnalysis !== false` (flag off → no marker, old behavior).

quality.ts — add export:

```ts
export function checkDegradedArtifact(runDir: string): boolean {
  try {
    const p = join(runDir, "analysis", "proposals.json");
    if (!existsSync(p)) return false;
    const parsed = JSON.parse(readFileSync(p, "utf-8"));
    return parsed?.degraded === true;
  } catch { return false; }
}
```

stageValidate — after the quality gate: if `ctx.runId` has a run dir and `checkDegradedArtifact` is true, check the run's approval record (`data/approvals/<runId>.json`, may not exist); if no decision entry with `acceptDegraded === true`, push violation `{ rule: "degraded_analysis", value: 1, threshold: 0, message: "Run artifacts contain budget-degraded analysis; blocked from publish (accept with acceptDegraded in approval record)" }` → gate fails. Import `checkDegradedArtifact` and use `getRunDir`/`DATA_DIR` already in runner.ts.

- [ ] **Step 4: Run full suite + typecheck**

Run: `bun test; bunx tsc --noEmit`
Expected: all pass including extended budget/quality tests; baseline failures unchanged (4 pre-existing env failures).

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/runner.ts pipeline/src/quality.ts tests/pipeline
git commit -m "Budget fallback_to_fast_model with flagDegradedAnalysis: failover-model routing when over maxCostPerRun, degraded marker persisted into proposals artifact, validate blocks degraded runs unless approval accepts"
```

---

### Task 5: Final verification + docs touch-up

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-pipeline-core-controls-design.md` (mark implemented; note `halt` default retained, fallback opt-in)

- [ ] **Step 1: Full gate chain**

Run: `bun test; bunx tsc --noEmit; bun run tools/validate-topic.ts --all; bun run tools/generate-site.ts --all --out dist; bunx vitest run tests/golden/parity.test.ts`
Expected: baseline + new tests pass; tsc clean; 3 topics validate; generation succeeds; golden parity PASS.

- [ ] **Step 2: Spec status update**

Set spec header `**Status:** Implemented (core slice)` and append one line under §8 Deferred confirming P1/P4/P6 remain open. Commit:

```bash
git add docs/superpowers/specs/2026-09-03-pipeline-core-controls-design.md
git commit -m "Spec status: pipeline core controls implemented (halt default, fallback opt-in)"
```

- [ ] **Step 3: Push**

```bash
git push
```
