# Release Notes

## 2026-08-30 — Editorial "Perspective Evolution" timeline card (operator design template)

- **Rebuilt timeline strip** around the supplied editorial card template:
  cream/white card with a 4px dark left border, Playfair Display serif italic
  headline, perspective selector pills, dual insight card, and discrete slider
  with clickable tick labels.
- **Adopted map category colors** for pills, insight-card accent, time badge and
  slider thumb: technology `#0071e3`, platform `#6e6e73`, human-impact `#6c56b8`,
  economics `#b45b00`, infrastructure `#27804f` — exposed as `--color-*` tokens
  while keeping the template's editorial cream/card/serif treatment.
- **Timeline data emitted from real topic state data** via a new `timeline`
  block in `tools/generate-site.ts`: 4 entries, each keyed by perspective id,
  containing the period question as headline, the per-period body as theme, and
  a mechanical "What Changed" delta derived from source-volume changes and
  status between consecutive states.
- **Removed:** bubble-cloud rail, playhead/baseline SVG, collision code, continuous
  fractional slider, and the old ` Perspective evolution` row. Kept the map blobs,
  change sheet, lens modal, sources panel, and corpus chips untouched.
- **Accessibility:** pills are `<button>` elements with `aria-pressed`; tick labels
  are `<button>` elements with `aria-label`; headline uses `aria-live="polite"`.
- **Served-script parse check** passes; data strings continue to flow through the
  existing `q()` escaper.
- Golden re-blessed per Visual Fidelity Lock (SPECv4 §11).

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

## 2026-08-28 — Second real data cycle (think-tank corpus)

- **Domain-scoped research shipped:** Tavily `include_domains` support +
  `domains=`/`query=` CLI params on the research stage; ISO-date fallback
  fix (unparseable publish dates no longer drop candidates — they fall back
  to ingestion date).
- **Corpus grew 29 → 33 articles:** first pulls from Carnegie Endowment
  ("A Path Forward on AI Safety for the United States and China", "AI
  Adoption Journey for Population Scale") and 8 Brookings pieces (U.S.–China
  AI races, data-center prosperity, global AI divide).
- **Second proposal → approval → apply cycle** (run 6abea610): 20 proposals
  from the think-tank-enriched corpus; Platform consolidated (7 signals,
  weight 0.90), Human Impact doubled to 6 clusters, Technology declined
  (weight 0.40). Central question updated to "Who owns AI's choke
  points—and who answers for its consequences?" Golden re-blessed
  (36,205 chars).
- **Known issue logged:** writing-stage narrative summaries used id-based
  paths (`perspectives.<id>.summary`) that don't resolve on JSON arrays —
  rejected safely this cycle; writing prompt to be contracted for numeric
  paths next update.

## 2026-08-28 — Working READ ORIGINAL links on the live map

- **Renderer:** both source-card renderers (lens modal + sources panel) now
  emit `href="${s.url}" target="_blank" rel="noopener"` — real articles open
  the original publisher page in a new tab; legacy mock cards keep "#"
  (they have no URL).
- **Emitter:** the data block now carries `url` for real sources; migrated
  placeholder URLs are omitted so legacy cards stay inert.
- **Perspective sources refreshed (editorial curation):** 14 real articles
  appended to their lanes — technology 9, platform 5, infrastructure 4,
  human-impact 8, economics 3 (mock + real mixed; mock flagged as migrated).
  8 article perspective-tags corrected from the MVP ingestion default.
- Golden re-blessed (40,972 chars) — intentional renderer + data change per
  Visual Fidelity Lock procedure.

## 2026-08-28 — MIT Technology Review added as live source

- **License verified** via technologyreview.com/terms-of-service +
  /republishing/: all rights reserved, no open license; reuse only via paid
  syndication/single-use licensing (Copyright Clearance Center). Registered
  tier 2 / metered / copyright / link+summarize (pendingVerification
  cleared). Legacy mock-format entry ("MIT TECHNOLOGY REVIEW · ANALYSIS")
  remains for migrated source-001.
- **First domain-scoped pull from technologyreview.com:** 10/10 articles
  ingested (model customization, data infrastructure for AI agents, LLM
  startups, agentic chaos, AI benchmarks critique, autonomous enterprise).
- **Technology lane expanded:** 19 sources (10 MIT + 9 prior). Corpus now
  43 articles. Golden re-blessed (44,587 chars) per Visual Fidelity Lock.

## 2026-08-28 — Recency windows on the frontend (1 year / 3 months / 1 week)

- **Per-perspective recency counts** rendered as stat chips in the lens
  modal + sources panel: LAST 1 YEAR · LAST 3 MONTHS · LAST 1 WEEK.
- Computed mechanically in the refresh sync (bucketed by each article's
  date; ingestion date is the honest fallback for undated pages) — data
  lives in the topic JSON per perspective (`windows`), emitted into the
  data block.
- **sourceVolume derivation rule locked in** (fixes the "4 SOURCES vs 9
  articles" mismatch): the current period's sourceVolume is synced to the
  perspective's cataloged source count at apply/refresh time — the blob's
  count always equals the panel count. independentSignals clamped to ≤
  sourceVolume. Analysis agent contract updated (sourceVolume is derived,
  never estimated); validation checklist extended.
- Golden re-blessed (45,664 chars).

## 2026-08-28 — Bubble-cloud timeline (replaces Trend Rail)

- The operator's hand-sketch implemented: **a bubble cloud drifting at the
  playhead** — 5 bubbles (one per perspective) floating above a subtle
  wavy baseline, radius ∝ √article volume (area-proportional growth),
  category colors, organic vertical offsets + jitter with collision
  avoidance (4-pass nudge).
- **One-liners from the existing per-period bodies** (~60 chars, full text
  on hover via title) attached beside each bubble — the leading theme at
  that point in time.
- **Green/lime triangle playhead** points up at the scrub position;
  continuous scrubbing swells/shrinks and drifts the cloud in real time
  (the timelapse effect); release snaps to the nearest anchor.
- Bubble click opens the perspective lens (same as map blobs); bubbles are
  keyboard-focusable buttons with aria-labels; prefers-reduced-motion
  honored.
- **Removed:** Trend Rail lines, milestone chips, deriveMilestones, rail
  hover dimming — the convolution source. Readout (fastest-rising /
  fastest-falling from sparkline slopes) kept above the baseline.
- Golden re-blessed (83,182 chars). 164 tests green.

## 2026-08-28 — 4-period timeline + 11 new sources

- **Timeline reshaped to 4 periods:** 1 YEAR AGO → 3 MONTHS AGO → 1 MONTH
  AGO → 1 WEEK AGO (slider, ticks and periods 2025-08 / 2026-05 / 2026-07 /
  2026-08). Perspective bodies, sparklines and history extended to 4
  entries; the 1-WEEK state carries the live catalog counts, the 1-MONTH
  state carries the approved analysis snapshot.
- **Recency windows now 4 buckets** to match: LAST 1 YEAR · LAST 3 MONTHS ·
  LAST 1 MONTH · LAST 1 WEEK (month = 30 days).
- **11 new sources registered (operator batch #2):** Folha de S.Paulo, PBS,
  CBS News, NDTV, The Hindu, South China Morning Post, Stanford News,
  University of Oxford, VentureBeat, Online News Association, JAIR — all
  tier 3 / link_only pending license verification. BBC and WEF skipped
  (already registered). Registry now 61 publishers.
- **Corpus standing: 83 articles (68 real)** from ~25 publishers. Known
  follow-up: a publisher-name normalization pass for the ~20 auto-derived
  names ("Stjohns", "Nationalacademies", "AutoritAc de la concurrence"…)
  and per-article lane curation for the 40 newly ingested pieces (they are
  cached and visible to analysis, not yet on the perspective source lists).

## 2026-08-28 — S3 date quality + S4 RSS feeds

- **S3 (date quality):** metadata extraction upgraded with a strict
  priority chain — JSON-LD `datePublished` (handles @graph/arrays) →
  `article:published_time` → meta[name=date]/itemprop → `<time datetime>`.
  All dates normalized to YYYY-MM-DD; unparseable values fall through to
  the runner's today-fallback. JSON-LD also supplies publisher/headline
  fallbacks. Window chips get genuinely differentiated dates instead of
  ingestion-date fallbacks.
- **S4 (RSS):** `pipeline/src/tools/rss.ts` — RSS 2.0 + Atom reader (CDATA
  stripping, RFC-822 dates, graceful failure). 5 seeded feeds
  (data/config/feeds.json): The Conversation, Brookings, CFR, WEF, Atlantic
  Council. Research stage accepts `feeds=true` — feed items flow through
  the same fetch/policy/dedup/sponsored-guard pipeline. Zero Tavily quota.
- **164 tests** (+40), tsc clean, provider verification intact.

## 2026-08-28 — Corpus deepening: S5 → S2 → S1 → S6 executed

- **S5:** 4 auto-derived publisher names normalized (IBM, Neuberger Berman,
  Gradient Flow, Nebius AI) in cache + registry.
- **S2 (lane-scoped queries):** 5 perspective-lane research pulls (platform /
  infrastructure / economics / human / technology queries instead of the
  topic title) — corpus grew 43 → 74 with a diverse publisher mix (MIT
  Sloan, Yale Insights, HBS, NIST, National Academies, Bessemer, CFR,
  Moody's, Data Center Knowledge, POWER Magazine…).
- **S1 (domain-scoped pulls):** atlanticcouncil.org / weforum.org /
  goldmansachs.com / pewresearch.org / bipartisanpolicy.org / cfr.org /
  economist.com — corpus grew 74 → 83.
- **S6 (scheduled cadence):** weekly-research workflow (Mondays 05:00 UTC)
  — research pull + sync + validate + auto-commit of corpus growth. Skips
  gracefully until TAVILY_API_KEY is set as a repo secret.
- **Corpus standing: 83 articles (68 real)** from ~25 publishers. Known
  follow-up: a publisher-name normalization pass for the ~20 auto-derived
  names ("Stjohns", "Nationalacademies", "AutoritAc de la concurrence"…)
  and per-article lane curation for the 40 newly ingested pieces (they are
  cached and visible to analysis, not yet on the perspective source lists).

## 2026-08-28 — Economics pull, curation pass, window-count transparency

- **Economics-scoped research pull** (economist.com / ft.com / bloomberg.com):
  6 candidates → 4 legitimate Bloomberg editorial pieces ingested with real
  publish dates (Apr–Aug 2026); The Economist/FT pages blocked or metered as
  expected.
- **Curation pass:** 2 event-promotion pages removed from the cache (they are
  listings, not editorial content) — first editorial removals, documented
  here per the append-only review exception. 4 Bloomberg pieces lane-curated
  (platform ×2, economics, human-impact) and appended to perspective source
  lists. Cache now 47 articles.
- **Window-count transparency:** the recency chips now carry a tooltip —
  counts are by article date; undated articles are counted by discovery
  date. The Economics lane's 4/4/4/4 reading reflects three migrated demo
  articles (undated → discovery-dated) plus one real Bloomberg piece;
  it will differentiate as real dated articles accumulate.
- Golden re-blessed (49,697 chars).

## 2026-08-28 — Editorial independence: sponsored content excluded

- The 4 "Bloomberg" articles from the economics pull turned out to be
  **SPONSORED advertorials** (sponsored.bloomberg.com — Salesforce /
  ServiceNow / Global X paid campaigns), not Bloomberg journalism. Removed
  from the corpus per SPECv4 §2.4 (editorial independence); cache back to
  43 articles.
- **Research-stage guard added:** candidates from `sponsored.*` hostnames
  are auto-skipped with a telemetry event — advertorials cannot re-enter
  the corpus.
- Bloomberg registry entry updated with the exclusion rule (future
  ingestion: only www.bloomberg.com/news/ editorial).
- Window chips now carry a transparency tooltip: counts are by article
  date; undated articles are counted by discovery date.
- Golden re-blessed (48,339 chars).

## 2026-08-28 — Full-corpus curation: the map reflects all 107 articles

- **Lane curation pass completed** (operator-approved mapping): all 68
  previously uncataloged articles assigned + 8 excluded as non-AI
  sitewide-feed noise (Atlantic Council general feed + 1 Reddit homepage).
- **Cataloged sources: 39 → 99** across 5 perspectives — technology 31,
  platform 18, human-impact 18, infrastructure 16, economics 16. The map
  now reflects the full 107-article corpus (9 demo baseline + 99 real).
- Windows + last-state volumes resynced; blobs, chips and counts rescaled
  to the deepened corpus.
- **Corpus transparency stat:** the data block now emits
  `corpus:{total,real}` and the lens/panel windows strips render a
  CORPUS REAL chip — tracked-corpus depth visible alongside per-perspective
  counts.
- Editorial record: scripts/apply-corrected-curation.ts (the full mapping
  table) + scripts/curate-uncataloged.ts (heuristic audit trail).
- Golden re-blessed (70,889 chars) — intentional data + renderer change per
  Visual Fidelity Lock.

## 2026-08-28 — Trend Rail: perceptual timeline redesign

- **Continuous scrubbing with snap:** the slider interpolates smoothly
  between the 4 anchor states (blobs, volumes, question crossfade ease
  through time) and snaps to the nearest anchor on release. Interpolated
  positions are labeled honestly in the readout ("A → B").
- **Trend Rail (integrated above the slider):** 5 per-perspective trend
  lines (category-colored, height = article volume, x = time) with slope
  made visible — growth/decline readable pre-attentively. Direct labels at
  line ends, no legend. Hover dims other lines.
- **Milestone tags:** status transitions between anchor states (e.g.
  "Human Impact: Emerging → Growing") render as chips on the rail —
  chunked takeaways, not raw data.
- **Live readout:** floating chip at the playhead shows the current phase
  plus the fastest-rising and fastest-falling perspective per interval.
- **Accessibility:** reduced-motion disables easing; slider stays
  keyboard-focusable; milestone chips carry aria-labels.
- Grounded in the operator-cited visualization research (pre-attentive
  encoding, Gestalt continuity, overplotting avoidance, progressive
  transformation, time-series UX).
- Golden re-blessed (83,021 chars) — intentional renderer change per
  Visual Fidelity Lock. 164 tests green.

## 2026-08-28 — HOTFIX: runtime crash killed the entire frontend

- **Root cause (found via served-script parse check):** a CFR feed
  description contained a raw newline; the data-block emitter's string
  escaper handled quotes/backslashes but NOT line terminators — the
  generated `desc:'...'` literal broke across lines → **SyntaxError → the
  entire app.js never executed** → readers saw the static template fallback
  (single Platform card, "TODAY" label, no rail, no trend lines).
- **Fix:** the escaper now escapes `\r\n`, `\n`, `\r`, U+2028 and U+2029 —
  verified by extracting the served script from dist and compiling it
  (`new Function`) — PARSE OK.
- **Process fix:** the served-script parse check is now the definitive
  pre-deploy verification for every generator change (tsc/bun tests cannot
  catch browser-runtime parse errors in inlined JS).
- Golden re-blessed (83,024 chars).

## 2026-08-28 — Historical backfill: 2025–2026 coverage (adapter upgrade)

- **Search adapter upgraded:** absolute date-range support
  (`start_date`/`end_date` via Tavily general topic — the news topic +
  relative-days window no longer caps historical pulls) + CLI
  `daterange=YYYY-MM-DD:YYYY-MM-DD` param on the research stage.
- **First 2025–2026 backfill executed** — 3 date-sliced pulls
  (2025-08→2026-02, 2026-02→2026-06, 2026-06→2026-08): **24 new articles
  ingested** (all clean, zero skips), corpus grew **83 → 107 (92 real)**.
- New articles are cached and visible to the next analysis pass; they are
  NOT yet on perspective source lists — lane curation pass pending
  (follow-up from the deepening strategy).
- Tavily quota used: ~3 searches (well within free tier).

## 2026-08-28 — RSS feed verification cycle

- **First live RSS pull** (`feeds=true`): pipeline mechanics verified
  end-to-end — feeds attempted, failures logged, items ingested through the
  full policy/dedup/sponsored-guard pipeline. Result: only **1 of 5 seeded
  feeds actually delivered** (Atlantic Council — 6 items).
- **Feed URL verdicts:** Atlantic Council ✅ (working); The Conversation
  404/406 (public RSS gated), Brookings serves its HTML homepage for all
  feed patterns (bot-gated WordPress), CFR 404 (Next.js, no public RSS),
  WEF 403 (bot-blocked). Dead feeds pruned from feeds.json per the
  feed-verification rule — re-add when URLs are verified via publisher
  contact.
- **XML-content guard added to rss.ts:** an HTTP 200 + HTML body (a dead or
  bot-gated feed) is logged clearly instead of silently parsing to zero
  items. Fixed a malformed feeds.json (object instead of array) that
  crashed the runner.
- Tavily `include_domains` remains the primary sourcing path for gated
  publishers; RSS stays the zero-quota complement for verified feeds.
- 164 tests green, topic validation green.

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