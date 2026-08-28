# Editorial Perspective Map — Specification

## Version 0.4 · Draft · August 27, 2026

> Supersedes v0.1 (SPEC.md), v0.2 (ChatGPT revision), and v0.3 (merge draft).
> v0.4 unifies the editorial methodology of v0.2 with the OpenCode agent/skill
> definitions of v0.1, and adds an explicit **orchestration model**: how the
> agents run as a coordinated pipeline with parallel lanes, handoff contracts,
> and human approval gates.

---

## Table of Contents

1. [Overview & North Star](#1-overview--north-star)
2. [Editorial Methodology](#2-editorial-methodology)
3. [Current System Understanding](#3-current-system-understanding)
4. [Target Architecture](#4-target-architecture)
5. [Data Model](#5-data-model)
6. [Agent System](#6-agent-system)
7. [Orchestration Model](#7-orchestration-model)
8. [Skill Definitions](#8-skill-definitions)
9. [Feature Roadmap](#9-feature-roadmap)
10. [Trust, Quality & Editorial Controls](#10-trust-quality--editorial-controls)
11. [Technical Constraints & Decisions](#11-technical-constraints--decisions)
12. [Next Steps](#12-next-steps)
13. [Appendix A · Canonical User Journey](#appendix-a--canonical-user-journey)
14. [Appendix B · Glossary](#appendix-b--glossary)

---

## 1. Overview & North Star

### What This Is

**Editorial Perspective Map** is an audience-facing interactive publication. It is
not a news feed or article aggregator — it is a visual system for understanding
**how arguments change over time**.

Each edition covers **one topic at depth**, breaking the conversation into
distinct viewpoints ("perspectives"), tracking their evolution across time
periods, and producing a synthesized conclusion. Every claim traces to original,
attributed sources.

### Core Product Loop

| Step | Question it answers |
|------|--------------------|
| **Topic** | What are we trying to understand? |
| **Perspectives** | What distinct lenses exist? |
| **Evolution** | How are those lenses gaining, losing, or changing attention? |
| **Synthesis** | What does the collective evidence reveal? |

### North Star

> Editorial should help a reader answer not only *"What are people saying?"*
> but *"How is the argument changing, why is it changing, and what does the
> evidence suggest?"*

### Design Principles

- **Depth over breadth** — one topic at a time, thoroughly analyzed
- **Change over snapshots** — the value is in showing *how* the conversation moves
- **Attribution first** — every perspective traces to named publishers and articles
- **Evidence before synthesis** — synthesis is downstream of source evidence
- **Editorial transparency** — distinguish evidence, interpretation, and synthesis
- **Human approval** — agents assist; humans approve publication

---

## 2. Editorial Methodology

### 2.1 Topic → Perspective → Argument → Evidence

A perspective is more than a cluster of articles. A thematic cluster is an
*input* to analysis; a **perspective is an editorial lens or argument about the
topic**.

| Element | Example (topic: AI Superrace) |
|---------|-------------------------------|
| **Topic** | AI Superrace |
| **Perspective** | Human Impact |
| **Core argument** | AI adoption may create social disruption that could outweigh near-term productivity gains. |
| **Counterargument** | AI may primarily augment workers and create new categories of work. |
| **Evidence** | Open-access articles and independent editorial analysis supporting or challenging the arguments. |

### 2.2 Counter-Perspectives

Each major perspective carries competing arguments so the map never implies
false consensus.

| Element | Purpose |
|---------|---------|
| Core argument | Strongest editorial thesis the perspective represents. |
| Counterargument | Credible opposing interpretation supported by evidence. |
| Supporting evidence | Sources materially supporting the argument. |
| Challenging evidence | Sources materially weakening or complicating it. |

### 2.3 Editorial Weight

Source count stays visible but never solely drives visual importance. Analysis
weighs six signals:

| Signal | Meaning |
|--------|---------|
| Source volume | Amount of coverage. |
| Source quality | Depth, originality, editorial significance. |
| Independence | Whether sources are genuinely independent signals. |
| Recency | Current relevance. |
| Momentum | Rate of attention change. |
| Confidence | Strength of evidence behind the classification. |

### 2.4 Editorial Independence

The system distinguishes **article volume** from **independent editorial
signals**. Syndicated or derivative coverage does not count as independent
evidence merely because it appears in multiple publications. Articles are
grouped into story clusters; one cluster contributes one independent signal
regardless of republication count.

---

## 3. Current System Understanding

### File Structure (Today)

```
editorial_perspective/
├── editorial_perspective_evolution_v3.html   # 474 lines, self-contained SPA
└── docs/
    ├── SPEC.md                                # v0.1
    └── SPECv4.md                              # This document
```

### Architecture (Current)

Monolithic client-side SPA — CSS, HTML, JavaScript, and data all inline:

| Layer | Implementation | Location in file |
|-------|---------------|------------------|
| View | Vanilla HTML/CSS, responsive breakpoints | Lines 1–94 (CSS), 96–156 (HTML) |
| Interactions | Event handlers, DOM manipulation, transitions | Lines 158–471 (JS) |
| Data | Hardcoded JS literal objects in `<script>` | Lines 159–275 |
| Rendering | `getElementById` + innerHTML injection | Throughout JS |
| Animation | `requestAnimationFrame` line redraws; CSS transitions for blobs | Lines 368–377; line 36 |

### Core Data Blocks (Current)

- **`states[]`** — 3 timeline periods; each holds label, central question,
  synthesis, line strength, and 5 node definitions (position, size,
  border-radius, source count, status, opacity, mobile overrides)
- **`perspectiveBodies{}`** — per-perspective description variants, one per period
- **`details{}`** — per-perspective summary, sparkline data, history steps,
  and source article list
- **`relations[]`** — cross-perspective connection pairs

### Known Limitations

- All data hardcoded — updates require editing raw JavaScript
- Single topic baked in
- Static hosting only; no backend, no APIs
- Mock article data — no real sourcing
- Direct DOM rewrites — not optimized for scale

---

## 4. Target Architecture

### System Diagram

```
                  ┌──────────────────────────────────────┐
                  │          Publication Layer           │
                  │        (GitHub Pages / CDN)          │
                  └──────────────────────────────────────┘
                                    ▲
                  ┌─────────────────┴─────────────────┐
                  │        Generator Pipeline          │
                  │                                    │
                  │  Research → Analysis → Writer      │
                  │        → QA / Human Approval       │
                  └─────────────────┬─────────────────┘
                                    ▲
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                       ▼
  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
  │   Topic Store    │   │  Article Store   │   │   Config Store   │
  │  topics/*.json   │   │ articles/*.json  │   │  settings.json   │
  └──────────────────┘   └──────────────────┘   └──────────────────┘
```

**Architecture rule:** Analysis answers *what is happening?* Visualization
decides *how to represent it.* The analysis layer produces semantic metrics;
the renderer converts them into size, position, glow, opacity, and connections.

### Directory Structure (Target)

```
editorial_perspective/
├── docs/
│   ├── SPECv4.md                        # This document
│   └── RELEASE_NOTES.md                 # Changelog
├── src/
│   ├── index.html                       # Clean template, no inline data
│   ├── css/
│   │   ├── main.css                     # Modular styles
│   │   └── variables.css                # Design tokens
│   └── js/
│       ├── app.js                       # App shell, event wiring
│       ├── render/
│       │   ├── map.js                   # Perspective map
│       │   ├── lens.js                  # Lens modal
│       │   ├── change-sheet.js          # Change sheet
│       │   └── sources-panel.js         # Sources panel
│       ├── data/
│       │   ├── loader.js                # Loads topic data
│       │   └── adapters.js              # Raw data → view models
│       └── utils/
│           ├── animators.js
│           └── format.js
├── data/
│   ├── topics/
│   │   ├── index.json                   # Topic manifest
│   │   └── ai-superrace.json            # Migrated first topic
│   └── articles/
│       └── articles_cache.json          # Fetched source cache
├── templates/
│   └── topic.json                       # Schema/template for new topics
├── tools/
│   ├── generate-site.mjs                # data + template → publishable HTML
│   ├── migrate-from-html.mjs            # Extract current HTML data → JSON
│   └── validate-topic.mjs               # Pre-publish schema validation
└── package.json
```

### Key Architectural Shifts

| Aspect | Current | Target |
|--------|---------|--------|
| Data storage | Hardcoded JS in HTML | JSON in `/data/topics/` |
| Template | Monolithic HTML | Separated template + data |
| Topic scope | One topic baked in | Multi-topic, manifest-driven |
| Article sourcing | Mock data | Research Agent → cached JSON |
| Build process | Manual file edit | `generate-site.mjs` |
| Styling | Inline `<style>` | Modular CSS + design tokens |
| JavaScript | One script block | Modules by responsibility |

### Decision Log

- **Static-first:** deployable to GitHub Pages/Netlify/Cloudflare Pages; all
  transformations at build time; no runtime database initially.
- **JSON data layer:** agent-generatable, human-editable, scraper-pluggable.
- **Visual fidelity lock:** Phase 1 migration must produce pixel-identical
  output to V3. Future visual changes require sign-off in Release Notes.
- **Additive states:** topic JSON grows by appending states; no destructive
  migrations.

---

## 5. Data Model

### 5.1 Semantic Metrics

Produced by the Analysis Agent per perspective per period. The visualization
layer maps these to visual treatment — never the reverse.

```jsonc
{
  "editorialWeight": 0.82,     // composite importance, 0–1
  "sourceVolume": 24,          // raw article count
  "independentSignals": 9,     // deduplicated story clusters
  "momentum": 0.71,            // rate of attention change, 0–1
  "emergence": 0.88,           // newness of the perspective, 0–1
  "confidence": 0.84,          // evidence strength behind classification, 0–1
  "status": "Emerging"
}
```

### 5.2 Temporal States

The model supports an arbitrary number of states. The UI may display three
while the data holds monthly or weekly history.

```jsonc
{ "states": [
    { "period": "2026-05" },
    { "period": "2026-06" },
    { "period": "2026-07" },
    { "period": "2026-08" }
] }
```

### 5.3 Topic Schema

```jsonc
{
  // -- Metadata --
  "slug": "ai-superrace",
  "title": "The AI race is moving beyond foundation models.",
  "subtitle": "The editorial conversation is widening toward agents, distribution, infrastructure, economics and human impact.",
  "kicker": "THE OPEN EDITION",
  "date": "2026-08-27",
  "nav": ["Today", "Conflicts", "Global Economy", "AI Superrace"],
  "activeNav": "AI Superrace",

  // -- Timeline States --
  "states": [
    {
      "period": "2026-05",
      "label": "90 DAYS AGO",
      "question": "Who has the smartest model?",
      "synthesis": "The editorial conversation is narrowly focused on model capability...",
      "lineStrength": 0.35,
      "nodes": {
        "technology": {
          "position": { "x": 10, "y": 8 },
          "size": { "w": 28, "h": 22 },
          "borderRadius": "44% 56% 51% 49% / 54% 43% 57% 46%",
          "opacity": 1,
          "mobile": { "x": 5, "y": 6, "w": 44, "h": 15 },
          "metrics": {
            "editorialWeight": 0.9,
            "sourceVolume": 24,
            "independentSignals": 11,
            "momentum": 0.2,
            "emergence": 0.1,
            "confidence": 0.85,
            "status": "Dominant"
          }
        }
        // ... remaining perspectives, same shape
      }
    }
    // ... more states
  ],

  // -- Perspective Catalog --
  "perspectives": [
    {
      "id": "human-impact",
      "name": "Human Impact",
      "category": "human",
      "summary": "Human impact has emerged from near-invisibility into a recurring lens...",
      "coreArgument": "AI adoption may create social disruption that could outweigh near-term productivity gains.",
      "counterArgument": "AI may primarily augment workers and create new categories of work.",
      "bodies": [
        "Jobs, education and creativity are rarely discussed.",
        "Labor and learning enter the margins of the debate.",
        "Who benefits and who is displaced is now a recurring editorial lens."
      ],
      "sparkline": [0, 6, 13],
      "history": [
        "Jobs, education and creativity are rarely part of the framing.",
        "Labor and learning enter the margins of coverage.",
        "Who benefits and who bears the cost is now part of the central question."
      ],
      "sources": ["source-014", "source-022", "source-031"]
    }
    // ... other perspectives
  ],

  // -- Relations --
  "relations": [
    {
      "from": "infrastructure",
      "to": "economics",
      "strength": 0.78,
      "reason": "Compute costs directly shape AI economics."
    }
  ]
}
```

### 5.4 Source Schema

Sources live in the article store and are referenced by ID from perspectives.

```jsonc
{
  "id": "source-014",
  "publisher": "THE GUARDIAN",
  "title": "AI and the future of work",
  "description": "How editorial coverage is reconnecting automation with workers.",
  "date": "2026-08-20",
  "type": "ANALYSIS",          // ANALYSIS | REPORT | OPINION | FEATURE
  "url": "https://...",
  "accessPolicy": {
    "access": "open",                      // open | metered | paywalled
    "license": "copyright",                // CC | CC-BY | CC-BY-ND | CC-BY-SA | copyright | unknown
    "reuse": "link_only",                  // allowed_with_attribution | link_only | none
    "fullText": false,
    "summary": true,
    "link": true,
    "pendingVerification": false
  },
  "storyCluster": "cluster-17", // dedup group for independence counting
  "originalReporting": true,
  "stance": "supporting",      // supporting | challenging | neutral
  "perspectives": ["human-impact"]
}
```

Policies are resolved from the publisher registry (`data/config/publishers.json`)
at ingestion — unknown publishers default to `link_only` pending human license
verification. Full semantics and enforcement points: **IMPLEMENTATION.md §5**.

### 5.5 Status Enum

| Status | Meaning | Visual treatment |
|--------|---------|------------------|
| `Dominant` | Highest current attention | Largest weight; dark fill, white text |
| `Accelerating` | Attention rising rapidly | Blue glow, increasing prominence |
| `Growing` | Attention rising steadily | Normal growth treatment |
| `Cooling` | Attention declining | Reduced prominence, orange trend |
| `Emerging` | Crossing visibility threshold | Purple glow, emergence animation |
| `Invisible` | Below threshold | Hidden from primary map (opacity < 0.05) |

### 5.6 Category Color Tokens

| Category | Token | Tint |
|----------|-------|------|
| `tech` | `--blob-bg:#e9f3ff` | Soft blue |
| `human` | `--blob-bg:#f2edff` | Soft purple |
| `econ` | `--blob-bg:#fff0df` | Soft orange |
| `infra` | `--blob-bg:#eaf7ef` | Soft green |
| `platform` | `--blob-bg:#f4f4f5` | Soft gray |

---

## 6. Agent System

Four agents with explicit contracts. Each contract defines inputs, outputs,
workflow, and constraints so agents can be run independently, in parallel where
lanes allow, and reconciled by the orchestration model in Section 7.

---

### 6.1 Research Agent

**ID:** `research-agent` · **Lane:** discovery (read web, write article store only)

**Role:** Discover, classify, and cache eligible open-access source material.

**Inputs:** topic slug · keyword query · date range (default: last 90 days) ·
priority publisher list

**Outputs:** updated `data/articles/articles_cache.json` · run summary
(articles found, duplicates skipped, paywalled noted)

**Workflow:**

```
1. Read topic JSON → extract keywords and publisher preferences
2. Search recent editorial coverage (websearch)
3. Resolve accessPolicy per candidate from the publisher registry;
   unregistered publishers are appended as tier 3 (unknown/link_only)
   and queued for human license verification
4. Extract metadata only — never reproduce protected article content
   (title, publisher, date, type, description/snippet, URL)
5. Detect duplicates and story-level relationships → assign storyCluster
6. Assign preliminary thematic cluster tags
7. Append validated entries to article cache with evidence lineage
```

**Constraints:**
- Always attribute original publishers verbatim — never strip attribution
- Skip paywalled articles (log them, don't ingest)
- Metadata extraction only; no full-text reproduction
- Max 3 new articles per perspective per fetch cycle

---

### 6.2 Analysis Agent

**ID:** `analysis-agent` · **Lane:** analysis (reads article store, proposes topic-store changes)

**Role:** Convert the article corpus into evidence-backed perspective and trend
suggestions.

**Inputs:** topic JSON · article cache · previous period state (for comparison)

**Outputs (all proposals, never direct writes):**
- Suggested `states[N].nodes` metrics, statuses, positions
- Suggested central question for the new period
- Draft synthesis paragraph
- New perspectives crossing the visibility threshold
- Perspectives dropping below threshold (archive candidates)

**Workflow:**

```
1. Cluster articles into themes (semantic similarity of titles/descriptions)
2. Distinguish themes from arguments — identify candidate perspectives
3. Identify supporting and counterarguments per perspective
4. Detect duplicated/syndicated stories → independence counting
5. Calculate semantic metrics: sourceVolume, independentSignals,
   momentum, emergence, editorialWeight, confidence
6. Assign status per perspective (Dominant … Invisible)
7. Compare current vs previous state → structural change report
8. Suggest central-question evolution and draft synthesis
```

**Constraints:**
- Every claim cites specific article counts and clusters backing it
- Never invent perspectives — only surface what the corpus supports
- Every status assignment carries a confidence score
- Central questions: 8–15 words, action-oriented
- Synthesis must reference at least 3 distinct perspectives

---

### 6.3 Writing Assistant

**ID:** `writing-assistant` · **Lane:** narrative (rewrites text fields only)

**Role:** Refine all narrative text — summaries, arguments, syntheses,
descriptions, central questions — for editorial quality and consistent tone.

**Inputs:** full topic JSON · mode: `draft` | `refine` | `audit`

**Outputs:** revised text organized by field for merge · audit report
(mode `audit`)

**Workflow (draft/refine):**

```
1. Review narrative across all perspectives and states
2. Flag: repetitive phrasing, inconsistent terminology, weak questions,
   synthesis that fails to integrate perspectives
3. Rewrite iteratively:
   a. Each perspective summary unique and distinctive
   b. Counterarguments represented fairly
   c. Central questions show clear progression across periods
   d. Synthesis answers: what do the perspectives collectively reveal?
4. Flag unsupported or overly strong claims for human review
```

**Workflow (audit):**

```
1. Cross-perspective uniqueness (no two summaries overlap >40%)
2. Central question progression is meaningful, not duplicated
3. Source titles descriptive and accurate
4. Report: issues, severity, recommended fixes
```

**Constraints:**
- Tone: authoritative, analytical, measured — never sensationalist
- Length discipline: summaries ~40–60 words · syntheses ~50–80 words ·
  central questions ~8–15 words
- Present tense, active voice; no hyperbole, no unqualified predictions
- Never alters metrics, positions, or source data — text fields only

---

### 6.4 Content Manager

**ID:** `content-manager` · **Lane:** data lifecycle (sole writer to topic store)

**Role:** Manage topic data lifecycle — creation, migration, validation,
backups, manifests. **The only agent that commits changes to
`data/topics/`**, and only after human approval.

**Inputs:** operation: `create-new` | `migrate` | `validate` | `backup` |
`restore` | `apply-approved` · supporting data

**Outputs:** created/migrated/validated files · execution log

**Key workflows:**

```
create-new:   template → populate metadata, perspectives, default states
              → validate → save data/topics/{slug}.json → update manifest

migrate:      parse editorial_perspective_evolution_v3.html
              → extract states[], perspectiveBodies{}, details{}, relations
              → transform to v0.4 topic schema (preserve numerics exactly)
              → validate → output JSON

validate:     schema checks + reconciliation (see Data Validation skill)

apply-approved: take human-approved proposals from Analysis/Writing lanes
              → back up current topic file → merge → validate → save
```

**Constraints:**
- Back up topic file before any transform
- Never applies unapproved agent proposals
- Maintains exact numeric precision on migration
- Keeps `data/topics/index.json` manifest in sync

---

## 7. Orchestration Model

*New in v0.4.* Defines how the four agents run as a coordinated pipeline
rather than isolated tools.

### 7.1 Pipeline & Lanes

```
        ┌────────────────┐
        │ Research Agent │  (independent — can run anytime)
        └───────┬────────┘
                │ article cache
                ▼
        ┌────────────────┐
        │ Analysis Agent │  (depends on: fresh cache)
        └───────┬────────┘
                │ proposals (metrics, statuses, question, synthesis draft)
                ▼
        ┌────────────────┐
        │ Writing Asst.  │  (depends on: analysis proposals)
        └───────┬────────┘
                │ polished narrative
                ▼
        ╔════════════════╗
        ║ HUMAN APPROVAL ║  (mandatory gate — nothing publishes without it)
        ╚═══════╤════════╝
                ▼
        ┌────────────────┐
        │ Content Manager│  (apply-approved → validate → save)
        └───────┬────────┘
                ▼
          generate-site.mjs → Publication Layer
```

### 7.2 Parallelization Rules

- **Research runs continuously and independently** — it only writes to the
  article cache, never the topic store, so it can run in parallel with
  everything else.
- **Analysis and Writing are sequential** within one update cycle (Writing
  needs Analysis proposals), but **multiple topics run as parallel pipelines**
  — each topic is an isolated lane with its own JSON file, so cycles for
  different topics never conflict.
- **Content Manager serializes all topic-store writes.** One writer, no merge
  conflicts.
- Design System audits run in parallel with any content lane (they touch
  `src/css/`, not `data/`).

### 7.3 Handoff Contracts

| Handoff | Artifact | Acceptance criteria |
|---------|----------|--------------------|
| Research → Analysis | Article cache entries | Valid schema; storyCluster assigned; accessPolicy resolved; no duplicates |
| Analysis → Writing | Proposal set | Every status has confidence; every claim cites clusters; question drafted |
| Writing → Human | Narrative + proposals | Audit passed; counterarguments present; length discipline met |
| Human → Content Manager | Approval record | Explicit approve/reject per proposal; edits captured |
| Content Manager → Publish | Validated topic JSON | Full validation checklist green; backup exists |

### 7.4 Failure Handling

- Any agent failure stops its own lane only; other topics/lanes continue.
- A rejected proposal returns to its originating agent with the human's notes —
  the agent revises rather than re-running from scratch.
- Validation failure at the Content Manager blocks the save and reports the
  exact failing checks; nothing partially publishes.
- Stale cache guard: Analysis refuses to run if the article cache is older
  than the period being analyzed.

---

## 8. Skill Definitions

Reusable workflows for the recurring editorial tasks.

### 8.1 Skill: New Topic Creation

**ID:** `new-topic-creation` · **When:** starting a fresh topic analysis.

```markdown
1. Define the topic
   - Choose a topic with genuine editorial disagreement
   - Headline-style title + explanatory subtitle; nav label + kicker
   - Pick 4–6 perspectives representing distinct lenses

2. Establish perspectives
   - Per perspective: summary, core argument, counterargument
   - Assign category color (tech/human/econ/infra/platform)
   - List 3+ representative sources per perspective (via Research Agent)

3. Create baseline state (oldest period)
   - Position perspectives by likely relative coverage then
   - Statuses: Dominant/Growing for heavy coverage; Invisible/Emerging for thin
   - Baseline central question + synthesis

4. Create intermediate state(s)
   - Adjust positions/sizes/opacities for coverage shifts
   - Transitional central question + synthesis

5. Create current state
   - Finalize from real analysis (Analysis Agent)
   - Ensure question progression tells a coherent story

6. Validate & review
   - Run data-validation skill
   - Run writing-assistant audit
   - Verify complete source attribution

7. Export
   - Save data/topics/{slug}.json; update manifest
```

**Output:** `data/topics/{topic-slug}.json` ready for the generator pipeline.

### 8.2 Skill: Period Update Flow

**ID:** `period-update-flow` · **When:** advancing a topic's timeline — the
most common maintenance task. This skill *is* one full pass of the Section 7
pipeline:

```markdown
1. Gather    — research-agent: fetch recent window (e.g., last 30 days)
2. Analyze   — analysis-agent: compare previous → new state; propose
               metrics, statuses, question, synthesis
3. Draft     — writing-assistant: polish narrative; update perspective
               bodies, history arrays, sparkline points
4. Approve   — human reviews the full proposal set; approves/edits/rejects
5. Apply     — content-manager: backup → merge approved → validate → save
6. Publish   — generate-site.mjs; visual inspection of output
```

**Output:** updated topic JSON with appended state, published site.

### 8.3 Skill: Data Validation

**ID:** `data-validation` · **When:** after any content modification; mandatory
pre-publish gate.

```markdown
Structure:
  ☐ Valid JSON; required keys present (slug, title, states, perspectives)
  ☐ All states share identical node keys
  ☐ Nav array 3–7 items; date parses as ISO

Geometry:
  ☐ x, y ∈ [0,100]; w, h ∈ (0,100]
  ☐ Border-radius strings parse (4 values / 4 values)
  ☐ Opacity ∈ [0,1]

Metrics:
  ☐ All metric values in range (weights/momentum/emergence/confidence ∈ [0,1])
  ☐ Every status has a confidence value
  ☐ independentSignals ≤ sourceVolume
  ☐ Sparkline/history/bodies arrays match state count

Narrative:
  ☐ No empty text fields
  ☐ Central questions 5–25 words; synthesis 20–120 words; summaries 15–80 words
  ☐ Question progression meaningful (no duplicates)
  ☐ ≤50% text overlap between perspective descriptions

Evidence:
  ☐ Every perspective has ≥3 sources
  ☐ Every perspective has core argument AND counterargument
  ☐ Source IDs resolve to article-store entries
  ☐ storyCluster assigned to every source; duplicates identified
  ☐ Publisher attribution + URL present; accessPolicy resolved for every source
  ☐ reuse 'allowed_with_attribution' requires license ≠ unknown
  ☐ No source has fullText: true (excerpts disabled at v0.4)
  ☐ pendingVerification sources listed in the report for human review
  ☐ Relations reference real perspective IDs; strength ∈ [0,1]
```

**Output:** pass/fail checklist with detail messages for failures.

### 8.4 Skill: Design System

**ID:** `design-system` · **When:** visual/layout changes or visual audits.

```markdown
Design tokens (variables.css):
  - Brand palette (bg, card, ink, muted, line)
  - Status accents (blue, green, orange, purple)
  - Category tints (tech, human, econ, infra, platform)
  - Spacing (8px rhythm), radius, shadows, type scale, z-index layers

Component audits:
  Header · Hero · Nav · Map canvas (orbits, center, blobs) · Change sheet ·
  Lens modal · Timeline slider · Synthesis block · Sources panel · Footer

Responsive breakpoints:
  ≥850px desktop · 561–849px tablet · ≤560px mobile
  (center repositioned, blob stacking, collapsed grids)

Accessibility targets:
  - Contrast ≥4.5:1 body text
  - Touch targets ≥44×44px
  - Keyboard navigable (Escape closes modals/sheets)
  - Semantic landmarks; aria-labels on icon-only buttons
  - prefers-reduced-motion respected for map animations
```

**Output:** audit report with severity ratings, or updated token set.

---

## 9. Feature Roadmap

| Phase | Goal | Deliverable |
|-------|------|-------------|
| **0 · Methodology** | Lock the editorial model | Definitions for perspective, argument, counterargument, evidence, independence, weight, confidence (Section 2 + 5 of this spec) |
| **1 · Foundation** | Separate data from presentation | JSON topic store, modular frontend, `generate-site.mjs`, migration of ai-superrace — pixel-identical output |
| **2 · Research** | Replace mock sources | Research Agent live; real open-access ingestion; article cache + dedup |
| **3 · Analysis** | Make the map intelligent | Clustering, argument detection, semantic metrics, relations, confidence |
| **4 · Editorial QA** | Build trust | Human approval workflow; pre-publish validation gate wired into pipeline |
| **5 · Multi-topic** | Scale publication | Topic manifest, selector UI, dynamic loading, reusable schema |
| **6 · Reader features** | Optional community layer | Article suggestions, annotations, newsletter *(requires backend — separate decision)* |

### What We Should Not Do Yet

- Do **not** build a backend for the first publication version.
- Do **not** automate publishing without human approval.
- Do **not** optimize for dozens of perspectives (safe zone: ≤7 perspectives ×
  ~5 states; revisit rendering approach beyond that).
- Do **not** treat raw article count as truth — independence and quality gate it.
- Do **not** make the homepage a conventional news feed.

---

## 10. Trust, Quality & Editorial Controls

### 10.1 Human-in-the-Loop

Agents propose. Humans approve. No automated publication until evidence and
narrative are reviewed. The approval gate in Section 7.1 is structural, not
optional.

### 10.2 Confidence

Every analytical classification (status, weight, emergence) carries a
confidence score derived from evidence volume, independence, source quality,
and consistency. Low-confidence classifications are flagged prominently at the
approval gate.

### 10.3 Pre-Publish Gate

The Data Validation skill (8.3) is the mechanical enforcement of:

- Valid schema and source reconciliation
- Every perspective has evidence; arguments have support
- Credible counterarguments represented
- Duplicate/syndicated stories identified
- Central-question progression meaningful
- Synthesis integrates multiple perspectives
- Publisher attribution + links present; accessPolicy resolved for every source

### 10.4 Visual Semantics

> **The map should tell the story before the reader reads the explanation.**
> As time changes, perspectives physically grow, shrink, move, appear, and
> fade. The reader then opens a perspective to understand the evidence
> behind it.

---

## 11. Technical Constraints & Decisions

- **Static-first:** deployable to GitHub Pages/Netlify/Cloudflare Pages. Build
  time transformations only; no runtime database. Reader features (Phase 6)
  require a separate infrastructure decision.
- **Editor-in-the-loop:** agents suggest; humans approve every change to
  published data; agents draft prose, humans finalize.
- **Persistence:** topic JSON is the single source of truth; article cache is
  regenerable; git history of `data/topics/` is the backup strategy.
- **Visual fidelity lock:** V3 design is fixed. Phase 1 must be
  pixel-identical. Visual changes need explicit sign-off in Release Notes.
- **Performance boundaries:** current DOM approach is safe to ~7 perspectives ×
  5 states. Beyond 10 perspectives, evaluate canvas/virtual-DOM rendering.
  Lens modals lazy-render on demand.
- **Copyright discipline:** metadata and short descriptions only; never
  reproduce protected article content; original publishers always attributed
  and linked.

---

## 12. Next Steps

Recommended sequence (Phase 0 → 1):

1. **Adopt this spec** — v0.4 definitions in Sections 2 and 5 are the locked
   editorial model.
2. **Migrate** — Content Manager `migrate`: extract all data from
   `editorial_perspective_evolution_v3.html` into
   `data/topics/ai-superrace.json` (v0.4 schema, mock metrics marked as
   placeholder).
3. **Split the frontend** — template + CSS + JS modules per Section 4.
4. **Build the generator** — `tools/generate-site.mjs`; verify pixel-identical
   output against V3.
5. **Wire validation** — `tools/validate-topic.mjs` implementing skill 8.3 as
   the pre-publish gate.
6. **Then Phase 2** — first real Research Agent run on ai-superrace.

### Agent/Skill Quick Reference

| Agent | Primary skill | Triggers on | Produces |
|-------|--------------|-------------|----------|
| Research Agent | Period Update Flow / New Topic | "Fetch sources for…" | Article cache entries |
| Analysis Agent | Period Update Flow | "Analyze the shift…" | Metric/status/question proposals |
| Writing Assistant | Both content skills | "Draft/refine/audit the narrative" | Polished, audited prose |
| Content Manager | All (sole writer) | Approved changes, migrations | Validated, backed-up topic JSON |
| — | Data Validation | Pre-publish, always | Pass/fail gate |
| — | Design System | Visual changes/audits | Audit report or tokens |

---

## Appendix A · Canonical User Journey

1. **Choose a topic.** Example: AI Superrace.
2. **See the current map.** Major perspectives form the conversation.
3. **Scrub time.** The map reorganizes as attention changes.
4. **Notice the central question.** It evolves with the conversation.
5. **Open "What Changed?"** See structural shifts between periods.
6. **Select a perspective.** Open its lens.
7. **Understand its trajectory.** Attention, history, arguments and counterarguments.
8. **Read the evidence.** Follow links to original open-access publishers.
9. **Return to synthesis.** Understand what the perspectives collectively reveal.

## Appendix B · Glossary

| Term | Definition |
|------|-----------|
| **Perspective** | An editorial lens or argument about the topic — not merely an article cluster. |
| **Story cluster** | A group of articles covering the same underlying story; counts as one independent signal. |
| **Independent signal** | A deduplicated, non-syndicated unit of editorial evidence. |
| **Editorial weight** | Composite importance score from volume, quality, independence, recency. |
| **Momentum** | Rate of attention change for a perspective between periods. |
| **Confidence** | Evidence strength behind an analytical classification. |
| **Central question** | The evolving framing question of the topic, one per period. |
| **Synthesis** | The editorial conclusion drawn from all perspectives in a period. |
| **Approval gate** | Mandatory human review between agent proposals and publication. |

---

*End of Specification v0.4*
