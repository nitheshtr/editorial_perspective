# Release Notes

## 2026-08-27 — Specs v0.4 / IMPLEMENTATION v0.3

SPECv4: editorial methodology, semantic metrics, orchestration.

IMPLEMENTATION v0.3: tool-neutral agent layer ADR-002, metrics/trace ADR-003,
scalability ADR-004, run persistence & replay ADR-005, artifact storage
backends ADR-006.

accessPolicy amendments to SPECv4 §5.4.

## 2026-08-27 — Phase 1 build begins

Scaffold added (package.json, tsconfig, config/pipeline.json, .env.example,
.gitignore).

agents/ and skills/ authored from spec.

> **Phase 1 deviation (deliberate):** `src/js` ships as a single `app.js`
> (verbatim V3 runtime) instead of the spec's modular `render/` tree —
> modularization is deferred until the golden-file byte-parity gate is locked,
> per the Visual Fidelity Lock (SPECv4 §11).

## 2026-08-27 — Phase 1 core: migration, generation, golden parity locked

- **Byte-exact V3 split:** `src/index.html` (template with `/*__CSS__*/`,
  `/*__DATA__*/`, `/*__APP__*/` placeholders), `src/css/variables.css` +
  `main.css`, `src/js/app.js` — split/reassembly self-checked byte-identical.
- **schema/** executable zod package (policy, metrics, source, node, state,
  topic, telemetry, approval, index) + **tools/validate-topic.ts** (schema,
  source-resolve, licensing vs registry, manifest-sync checks) — 46 unit
  tests green.
- **tools/migrate-from-html.ts:** V3 data block → v0.4 topic JSON (numerics
  exact; periods derived from labels; 15 sources migrated with
  unknown/link_only/pendingVerification accessPolicies; publisher registry =
  10 spec seeds + 15 migrated mocks; confidence capped at 0.5 pending
  Analysis review).
- **tools/generate-site.ts:** JSON → V3-format JS literal emitter; CLI with
  `--check` (golden compare) and `--bless` (recapture + release-notes
  requirement); dist output is self-contained single-file HTML.
- **GOLDEN PARITY LOCKED:** generated `dist/index.html` is byte-identical to
  the original V3 file (34,677 chars) — the Phase 1 acceptance gate passes;
  validation of migrated data passes all four checks.

## 2026-08-27 — Phase 1 complete: pipeline runtime

- **pipeline/** runtime per IMPLEMENTATION.md §7/§10/§13: three LLM provider
  adapters (OpenRouter default, OpenAI, Anthropic — retry/backoff/failover,
  mocked-transport tests), telemetry emitter (zod-validated JSONL per run +
  cross-run summary), path-scope guards with append-only article-cache
  enforcement, repository store with topic backup, agent frontmatter loader,
  runner CLI (stage=/workflow=/replay/rerun/approve/report), approval gate,
  stale-cache guard, per-run cost budget.
- **schema/src/proposal.ts** added (Proposal/ProposalSet) — the one schema
  extension beyond the spec, shared by analysis/writing/apply.
- **Approval-gate hardening (orchestrator review fix):** writing-stage
  narrative entries are folded into the proposal set (P-101+) and merge only
  through approved decisions — no LLM text reaches topic data unapproved
  (SPECv4 §7.1 structural gate).
- **Known MVP simplifications:** research stage calls the LLM directly
  (Tavily websearch integration deferred to Phase 2); providers default cost
  to 0 when config lacks price fields.
- **96 tests green** (unit + pipeline + golden parity), `tsc --noEmit` clean.
failed LLM responses dumped to the run dir for diagnosis.

## 2026-08-28 — Publisher registry: license verification + curated expansion

- **License verification completed** (evidence from publisher terms pages):
  The Conversation **CC BY-ND 4.0 confirmed** (tier 1, republication with
  attribution); Brookings, Chatham House, Public Knowledge **confirmed
  copyright / link+summarize only** (all pendingVerification flags cleared).
  Carnegie Endowment remains unverified (no terms page found — flagged for
  manual follow-up).
- **11 curated sources added** from a live 66-result AI-Superrace source
  scan (6 perspective lanes): McKinsey, SemiAnalysis, CFR, Atlantic Council,
  WEF, Goldman Sachs Research, Pew Research, Bipartisan Policy Center,
  Fortune (already present), Interconnects, Astral Codex Ten, Works in
  Progress — all tier 3 / link_only pending license verification.
- Registry now 42 publishers. Geopolitics (U.S.–China AI race) identified as
  a candidate 6th perspective from live coverage patterns.

## 2026-08-28 — Scalability review applied (spec §10/§14 amendments)

Scoped review (oracle + system-design frameworks: back-of-envelope,
scaling-evolution, caching, data-storage, observability) against real
telemetry from the first production runs. Verdict: §14 + ADR-006 hold up;
three amendments applied:

- **Budget tightened $5.00 → $0.05/run** (observed cost ~$0.0025/run; $5
  was a 2,000× no-op guardrail). New `warn`-level budget event at 20% of
  limit.
- **Article-cache SQLite trigger raised 10k → 50k articles** (7.4 MB at
  10k parses trivially; the real constraint is read-to-append ratio) +
  explicit append-latency >2s condition.
- **Alerting gap closed (§10.5):** nightly CI healthcheck workflow
  (validate + research smoke test; skips gracefully without repo secrets),
  CI failure notifications, budget warning event.

Confirmed unchanged: S3 trigger fires correctly at ~200 runs (~7 MB, well
before the 50 MB ceiling), JSONL summary needs no rotation until >100k runs,
run-duration threshold gives 3× headroom.

## 2026-08-28 — First real data cycle published

- **Real research integration live:** Tavily search → page fetch → metadata
  extraction → accessPolicy resolution → append-only cache. 3+ real articles
  ingested (CNBC, TIME, Investor's Business Daily) with tier-3 policy
  queueing for unverified publishers.
- **First full proposal → approval → apply cycle** (run 5eee94ce): 24
  proposals generated from the real corpus; human approval record with 17
  approved/edited + 7 rejected; apply merged, re-validated, saved.
  ai-superrace metrics now reflect real source counts (5/5/3/3/3 vs mock
  24/22/19/14/13); Human Impact crossed Emerging → Growing; central question
  updated to "As AI deployment scales, who captures the value—and who is
  left behind?"
- **Golden re-blessed** (36,288 chars) per Visual Fidelity Lock procedure —
  drift was the approved data change itself.
- **Pipeline hardening along the way:** analysis/writing stages now fail the
  run loudly on unparseable LLM output (were silently succeeding); reasoning
  starvation on GLM-5.3-flash fixed via `reasoning: "low"` config +
  maxTokens 32768; hard output contract in prompts (integer counts, [0,1]
  ranges, exact node keys incl. "Human Impact", no invented states.3);
  root-relative guard fix in store (agent scopes vs DATA_DIR mismatch);
  failed LLM responses dumped to the run dir for diagnosis.