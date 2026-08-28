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