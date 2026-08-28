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