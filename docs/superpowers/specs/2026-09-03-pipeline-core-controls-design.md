# Pipeline Core Controls — Design

**Date:** 2026-09-03
**Status:** Approved in chat, pending final review
**Source spec:** `pipeline-recommendation-v0.2.md` (§8 budget/quality fixes, §11 config, §12 priorities)
**Scope decision:** "Core controls first" — the spec's three named defect-fixes plus the missing editorial controls. Full §12 P1–P6 deferred (see §8).

---

## 1. Context

The codebase already implements more of the v0.2 architecture than assumed:

- **Dedup / independent signals (§5):** done. URL dedup + story clustering at ingest (`storyCluster`, `pipeline/src/runner.ts:221–356`); `independentSignals` = count of distinct clusters, clamped ≤ sourceVolume at apply (`runner.ts:1086`). The spec's "every downstream metric computed from the deduplicated count" rule is already live.
- **Argument DNA (§6):** shipped in Wave-2 (`f780ef8`) with categorical `momentum: "up"|"down"`.
- **RSS + search sources:** both wired in the research stage (`createRssReader`, Tavily).

Missing: the quality gate (§8), budget-fallback visibility (§9), the §11 config shape, and argument-level numeric momentum.

## 2. Decisions (approved)

| Fork | Decision | Rationale |
|---|---|---|
| Scope | Core controls only | Spec §12 itself mandates priority order; P1/P4/P6 deferred |
| Momentum conflict | Additive `momentumScore: 0–1` next to categorical `momentum` | Spec's fix is about math-readability for rollups; the shipped UI keeps its arrows |
| Config migration | Clean rename to §11 keys, all readers updated in one commit | All config readers are in-repo; no dual-key compat debt |

## 3. Config migration (clean rename)

`config/pipeline.json` moves to the §11 shape. Key map:

| Current | Target (§11) |
|---|---|
| `models["models.research"]` | `models.research` |
| `models["models.analysis"]` | `models.analysis` |
| `models["models.writing"]` | `models.writing` |
| `models["models.apply"]` | `models.apply` |
| `budget.maxCostUsdPerRun` | `budget.maxCostPerRun` |
| `budget.actionOnExceed: "halt"` | `budget.actionOnExceed: "halt" \| "fallback_to_fast_model"` + new `budget.flagDegradedAnalysis: true` |
| `concurrency.maxParallelFetches` | `concurrency.maxParallel` |
| `search` | `sources.search` (same shape: provider, maxResults) |
| — | `quality` (new, §4) |
| — | `sources.rss { enabled, registry: "config/sources.json" }` (new, thin) |
| — | `cache`, `publication` (new, thin) |
| `artifacts.s3 {bucket,prefix}` | `artifacts.dirs {bucket,prefix}` + `readOnly: false` |

Retained extensions not in §11 (still required by the code): `defaults {maxTokens, timeoutMs}`, `failover` (now the fallback model source, §5), `retry`, `telemetry`. `telemetry.sink` stays `"jsonl"` — JSON Lines *is* JSON; the emitter is not rewritten for a cosmetic rename.

New blocks get real-but-minimal semantics — no inert config:

- `sources.rss.registry`: reader uses the registry file when it exists, else falls back to the current `data/config/feeds.json`. The full per-source registry is P1 (deferred).
- `publication.requireHumanApproval: true`: already de facto enforced by the apply stage's approval-record gate; now config-driven and asserted in the validate stage flow (not a quality-gate rule). `autoPublish: false` keeps publish stage-gated.
- `cache`: block present with TTL fields documented; TTL enforcement lands with P6. Config parser accepts it; no behavior claim.

## 4. Quality gate (`pipeline/src/quality.ts`, new)

Pure functions, unit-testable, invoked by the `validate` stage **after** `validateTopic` and before publish:

```ts
runQualityGate(topic, config.quality) -> { ok: boolean, violations: Violation[] }
// Violation: { rule, perspective?, value, threshold, message }
```

Rules (all evaluated against the **latest state only** — historical states are already-published snapshots):

1. `minimumConfidence` (0.70): `metrics.confidence < threshold` per perspective → violation.
2. `minimumIndependentSources` (3): `metrics.independentSignals < threshold` per perspective → violation.
3. `maximumSinglePerspectiveShare` (0.45, basis `independentSignals`):
   `share_X = independentSignals_X / totalIndependentSignals` where `totalIndependentSignals` = Σ over all perspectives in the state. Fires only when the denominator > 0 and `share_X > 0.45`. This is the §8 fix: share of *independent signals*, never raw article volume.
4. `requireCounterargument` (**ships `false`** — the five `counterArgument` fields are migrated placeholders that would hard-block): a perspective passes if it has a non-placeholder `counterArgument` OR ≥1 argument with `momentum: "down"` (or `momentumScore < 0.5` when present). Flip the config flag when placeholders are real.

Gate behavior: `!ok` → validate emits a `quality_gate` telemetry error event listing violations, and the stage exits non-zero (same pattern as a failed `validateTopic`). Publish-eligibility therefore equals validate success — no separate apply-stage gate.

## 5. Budget fallback + `flagDegradedAnalysis` (§9 fix)

Before each LLM call the runner consults spend (telemetry totals) against `budget.maxCostPerRun` (0.10):

- `actionOnExceed: "halt"` (default, unchanged): current behavior — run aborts at the budget guard.
- `"fallback_to_fast_model"`: remaining calls in the run route to the stage's `failover` model, and the response is marked **degraded**.
- Degraded marking: per-call `llm_degraded` telemetry event; the analysis proposals artifact gets top-level `"degraded": true` when any analysis-stage call ran degraded.
- Validate handling: a `degraded: true` run artifact produces a `degraded_analysis` violation (blocking). Override path stays human: an approval decision entry `{ "acceptDegraded": true }` in the run's approval record clears it — never silent, per §9 ("never let degraded output enter scoring on equal footing").

`"halt"` remains the committed default; fallback is opt-in via config.

## 6. `momentumScore` (additive, §6 fix)

- `schema/src/topic.ts`: `arguments[n].momentumScore?: number (0–1)` alongside shipped `momentum: "up"|"down"`.
- `tools/validate-topic.ts` (arguments check): range enforced by schema; if both present and contradictory (`score ≥ 0.5` but label `down`, or `score < 0.5` but label `up`) → validation failure. Score is the source of truth for future rollups; label stays the display field.
- `agents/analysis-agent.md`: arguments step gains one line — emit `momentumScore` derived from cluster attention delta for every argument.
- `tools/generate-site.ts`: passes `momentumScore` through to the lens payload when present. UI unchanged; no golden drift (no current data carries the field).

## 7. Tests & verification

- `tests/pipeline/quality.test.ts` (new): each rule passes/fails in isolation; share-basis math (syndicated-heavy corpus → share computed from signals, not volume); latest-state scoping; placeholder counterArgument passes only when flag is false.
- `tests/pipeline/`: config reader returns new keys; `halt` default preserved; fallback test with a fake provider asserts routing + `degraded` marker + validate violation + acceptance override.
- `tests/unit/validate-topic.test.ts`: momentumScore range + contradiction cases.
- Schema test: momentumScore parse.
- Gates: `bunx tsc --noEmit`, `bun test`, `bun run tools/validate-topic.ts --all`, golden parity untouched.

## 8. Deferred (not this slice)

- **P1:** `config/sources.json` full registry (per-source RSS URLs, access policy, health metadata) — config block lands thin; reader falls back to `feeds.json`.
- **P4:** `temporal_analysis` stage + git-snapshot comparison.
- **P6:** cache TTL enforcement, per-stage concurrency, model-routing tuning.
- **§13:** per-claim citation scoring, two-pass analysis, contradiction detector — revisit only after real runs expose those failures.

## 9. North Star

> Do not optimize the pipeline for producing more articles. Optimize it for producing a more accurate representation of how the editorial conversation is changing.
