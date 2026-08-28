# Editorial Perspective Map — Specification

## Version 0.1 · Draft · August 27, 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current System Understanding](#2-current-system-understanding)
3. [Architecture Vision](#3-architecture-vision)
4. [Data Model](#4-data-model)
5. [Agent Definitions (OpenCode)](#5-agent-definitions-opencode)
6. [Skill Definitions (OpenCode)](#6-skill-definitions-opencode)
7. [Feature Roadmap](#7-feature-roadmap)
8. [Technical Constraints & Decisions](#8-technical-constraints--decisions)
9. [Next Steps](#9-next-steps)

---

## 1. Overview

### What This Is

**Editorial Perspective Map** is an audience-facing interactive publication product. It visualizes how editorial conversations evolve around important topics by mapping multiple perspectives over time.

Each analysis covers **one topic at depth**, breaking the conversation into distinct viewpoints ("perspectives"), tracking their evolution across time periods, and producing a synthesized conclusion. Every claim references original sources.

### Current State

A single self-contained HTML file (`editorial_perspective_evolution_v3.html`, 474 lines). Everything lives in one file: CSS, HTML, JavaScript, and data are all inline. Data is hardcoded as JavaScript objects within `<script>` tags.

The current demo uses topic **"AI Superrace"** with 5 perspectives tracked across 3 time periods (90 days ago, 30 days ago, today).

### Design Philosophy

- **Depth over breadth** — one topic, thoroughly analyzed
- **Attribution first** — every perspective traces to named publishers and articles
- **Change over snapshots** — the value is in showing *how* the conversation moves, not where it sits at one moment
- **Transparency** — original publishers always credited; no synthetic claims presented without source lineage

---

## 2. Current System Understanding

### File Structure

```
editorial_perspective/
└── editorial_perspective_evolution_v3.html   # Only file: 474 lines, self-contained SPA
```

### Architecture (Current)

The application is a monolithic client-side SPA:

| Layer | Implementation | Location |
|-------|---------------|----------|
| **View** | Vanilla HTML/CSS with semantic layout, responsive breakpoints | Lines 1-94 (CSS), Lines 96-156 (HTML) |
| **Interactions** | Event handlers, DOM manipulation, transitions | Lines 158-471 (JavaScript) |
| **Data** | Hardcoded JavaScript literal objects embedded in `<script>` | Lines 159-275 |
| **Rendering** | Direct `document.getElementById()` calls + innerHTML injection | Throughout JS block |
| **Animation** | `requestAnimationFrame` for line drawing transitions, CSS transitions for blob movement | Lines 368-377, Line 36 |

### Core Data Structures

Three major data blocks exist within the script:

**States** (timeline periods): Each state defines:
- Label (e.g., "90 DAYS AGO")
- Central question text
- Synthesis paragraph
- Line connection strength
- Five node definitions, each with position (x, y), size (w, h), border-radius (br), source count, status, opacity, and mobile-specific positioning

**Perspective Bodies**: A flat object mapping each perspective name to an array of 3 strings — one description variant per time period

**Details**: A richer per-perspective object containing:
- Summary paragraph
- Sparkline data (3 numbers matching timeline states)
- History progression (3 strings)
- Source article list (3 articles, each with publisher, title, description, and optional link)

### Rendering Flow

1. On page load → `DOMContentLoaded` fires → `applyState(2, true)` renders "Today" state immediately
2. User drags timeline slider → `timeChange(v)` → `applyState(v)` updates all blobs, lines, synthesis text, central question
3. User clicks a blob → `openPerspectiveLens(name)` opens modal with sparkline, history steps, source articles
4. User clicks "View all sources" inside lens → closes modal → scrolls to expanded sources panel at bottom

### Known Limitations

- **All data is hardcoded** — adding a topic or updating data requires editing raw JavaScript
- **Single topic only** — the HTML has one set of hardcoded data baked in
- **Static hosting only** — runs on GitHub Pages or equivalent; no server, no database, no APIs
- **No interactivity beyond frontend** — user comments, feedback loops, analytics are all absent
- **Large DOM manipulation** — direct `innerHTML` rewrites throughout; not optimized for scale

---

## 3. Architecture Vision

### Target Architecture

```
                    ┌──────────────────────────────────────┐
                    │         Publication Layer            │
                    │         (GitHub Pages / CDN)          │
                    └──────────────────────────────────────┘
                                  ▲
                    ┌─────────────┴──────────────┐
                    │     Generator Pipeline      │
                    │                             │
                    │  ┌──────────┐ ┌──────────┐  │
                    │  │  Agent   │ │  Agent   │  │
                    │  │  Suite   │ │  Runner  │  │
                    │  └──────────┘ └──────────┘  │
                    └─────────────┬──────────────┘
                                  ▲
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
    ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
    │   Topic Store    │ │  Article Store   │ │  Config Store    │
    │                  │ │                  │ │                  │
    │  topic_a.json    │ │  articles_*.json │ │  settings.json   │
    │  topic_b.json    │ │  cache/          │ │  .editorconfig   │
    └──────────────────┘ └──────────────────┘ └──────────────────┘
```

### Directory Structure (Target)

```
editorial_perspective/
├── docs/
│   ├── SPEC.md                          # This document
│   └── RELEASE_NOTES.md                 # Changelog
├── src/
│   ├── index.html                       # Clean template, no inline data
│   ├── css/
│   │   ├── main.css                     # All styles, modular
│   │   └── variables.css                # Design tokens (colors, spacing)
│   ├── js/
│   │   ├── app.js                       # App shell, event wiring
│   │   ├── render/
│   │   │   ├── map.js                   # Perspective map rendering
│   │   │   ├── lens.js                  # Lens modal rendering
│   │   │   ├── change-sheet.js          # Change sheet logic
│   │   │   └── sources-panel.js         # Sources panel logic
│   │   ├── data/
│   │   │   ├── loader.js               # Loads current topic data from store
│   │   │   └── adapters.js             # Transforms raw data → view models
│   │   └── utils/
│   │       ├── animators.js            # Animation helpers
│   │       └── format.js               # Formatting utilities
│   └── components/                      # Reusable UI components
├── data/
│   └── topics/
│       ├── ai-superrace.json           # First topic (migration of current data)
│       └── [topic-slug].json           # Future topics
├── data/
│   └── articles/
│       └── articles_cache.json         # Cache of fetched/scraped articles
├── templates/
│   └── topic.json                       # Schema/template for new topics
├── tools/
│   ├── generate-site.mjs               # Builds final site from data + template
│   └── migrate-from-html.mjs           # Extracts data from current HTML → JSON
├── specs/                               # OpenCode skills live here
│   ├── research-agent/
│   ├── analysis-agent/
│   ├── writing-assistant/
│   ├── content-manager/
│   ├── new-topic-creation/
│   ├── period-update-flow/
│   └── data-validation/
└── package.json                         # Build tooling, scripts
```

### Key Architectural Shifts

| Aspect | Current | Target |
|--------|---------|--------|
| **Data storage** | Hardcoded JS literals in HTML | JSON files in `/data/topics/` |
| **Template engine** | Single monolithic HTML | Separated HTML template + data |
| **Topic scope** | One topic baked in | Multi-topic support, config selects active topic |
| **Article sourcing** | Mock/static data | Fetched via Research agent, cached as JSON |
| **Build process** | None (single file edit) | `generate-site.mjs` assembles template + data |
| **Styling** | All CSS in HTML `<style>` | Modular CSS files with design tokens |
| **JavaScript** | Monolithic script | Split into modules by responsibility |

### Decision Log

- **Static-first architecture**: Hosting stays on GitHub Pages or similar. Node builds produce static output. No backend needed unless we add reader features later.
- **JSON data layer**: All topic data becomes structured JSON. This makes it generatable by agents, editable by humans, and pluggable for future scrapers.
- **Generator pipeline**: `generate-site.mjs` reads topic JSON files + article cache → produces final publishable HTML. Keeps runtime code clean.
- **Preserve current UX**: Visual design, animations, and interaction patterns stay exactly as they are. Architecture changes should be invisible to readers.

---

## 4. Data Model

### Topic JSON Schema

Every topic follows this structure. Example keys shown for "AI Superrace":

```jsonc
{
  // -- Metadata --
  "slug": "ai-superrace",
  "title": "The AI race is moving beyond foundation models.",
  "subtitle": "The editorial conversation is widening toward agents, distribution, infrastructure, economics and human impact.",
  "kicker": "THE OPEN EDITION",
  "date": "2026-08-27",
  "nav": ["Today", "Conflicts", "Global Economy", "AI Superrace"],
  "activeNav": "Today",

  // -- Timeline States --
  "states": [
    {
      "label": "90 DAYS AGO",
      "question": "Who has the smartest model?",
      "synthesis": "The editorial conversation is narrowly focused on model capability...",
      "lineStrength": 0.35,
      "nodes": {
        "Technology": {
          "position": { "x": 10, "y": 8 },
          "size": { "w": 28, "h": 22 },
          "borderRadius": "44% 56% 51% 49% / 54% 43% 57% 46%",
          "sources": 24,
          "status": "Dominant",
          "opacity": 1,
          "mobile": { "x": 5, "y": 6, "w": 44, "h": 15 }
        },
        // ... Platform, Infrastructure, Economics, Human Impact follow same shape
      }
    },
    // 30 DAYS AGO state...
    // TODAY state...
  ],

  // -- Perspective Catalog --
  "perspectives": [
    {
      "id": "Technology",
      "category": "tech",
      "summary": "The technology perspective has moved from leaderboard dominance...",
      "sparkline": [24, 18, 14],
      "history": [
        "Benchmarks and model releases set the editorial agenda.",
        "Agents and product integration begin to rival raw capability.",
        "Capability is assumed; the question is what it enables and who controls it."
      ],
      "sources": [
        {
          "publisher": "MIT TECHNOLOGY REVIEW",
          "type": "ANALYSIS",
          "title": "After the benchmark boom",
          "description": "Why raw model performance is becoming background noise in the AI race.",
          "url": ""
        }
        // ... more sources
      ]
    }
    // ... other perspectives
  ]
}
```

### Status Enum

Valid perspective statuses used across states:

| Status | Meaning | Visual Treatment |
|--------|---------|-----------------|
| `Dominant` | Most discussed right now | Dark fill, white text |
| `Accelerating` | Coverage growing fast | Blue glow effect |
| `Growing` | Coverage increasing steadily | Normal appearance |
| `Cooling` | Coverage declining | Red trend indicator |
| `Emerging` | New perspective entering frame | Purple glow effect |
| `Invisible` | Below threshold, hidden | Opacity < 0.05 |

### Category Color Tokens

Perspective categories map to background tint colors:

| Category | Token | Background |
|----------|-------|------------|
| `tech` | `--blob-bg:#e9f3ff` | Soft blue |
| `human` | `--blob-bg:#f2edff` | Soft purple |
| `econ` | `--blob-bg:#fff0df` | Soft orange |
| `infra` | `--blob-bg:#eaf7ef` | Soft green |
| `platform` | `--blob-bg:#f4f4f5` | Soft gray |

### Relations

Optional cross-perspective relationships:

```jsonc
"relations": [
  ["Infrastructure", "Economics"],   // Dashed purple line between these nodes
  ["Economics", "Human Impact"]
]
```

---

## 5. Agent Definitions (OpenCode)

These are OpenCode agents designed to help you create, maintain, and update the Editorial Perspective Map.

---

### Agent: Research Agent

**ID:** `research-agent`

**Role:** Fetches real-world articles, extracts source metadata, and populates the article cache for a given topic.

**Inputs:**
- Topic slug (e.g., `"ai-superrace"`)
- Keyword query derived from topic title
- Date range filter (defaults: last 90 days)
- Priority publishers list (configurable per topic)

**Outputs:**
- Updated `data/articles/articles_cache.json` with fetched articles
- Markdown summary of findings (printed during execution)

**Workflow:**

```
1. Read topic JSON → extract keywords and priority publishers
2. Search web (via websearch) for recent articles using topic keywords
3. Cross-reference against priority publisher list
4. For each candidate article:
   a. Fetch URL content (via webfetch)
   b. Extract: title, publisher, date, type (analysis/report/opinion), description/snippet
   c. Check for duplicate (same title, already cached)
   d. If new and valid, append to articles cache
5. Output structured article batch ready for ingestion
```

**Skills Used:**
- Web search capabilities
- Content fetching and extraction

**Constraints:**
- Always attribute original publishers — never strip source attribution
- Maximum 3 articles per perspective per fetch cycle
- Skip paywalled articles (note them but don't include)
- Preserve original publication names verbatim

**Example Invocation:**

```
research-agent for topic: ai-superrace
focus on: Infrastructure perspective
date range: last 30 days
priority publishers: Financial Times, Reuters, Wall Street Journal
```

---

### Agent: Analysis Agent

**ID:** `analysis-agent`

**Role:** Analyzes the current collection of articles to identify emerging perspectives, calculate coverage trends, and suggest state updates.

**Inputs:**
- Topic JSON (current state)
- Article cache (from Research agent)
- Optional previous period state (for comparison)

**Outputs:**
- Updated `states[N].nodes` — suggested positions, sizes, opacities, statuses
- Updated `states[N].question` — suggested central question for the latest period
- Updated `states[N].synthesis` — draft synthesis paragraph
- Identified new perspectives that have crossed visibility threshold
- Perspectives that have dropped below threshold (to be archived)

**Workflow:**

```
1. Ingest all articles for the topic from articles_cache
2. Cluster articles into thematic groups (perspectives)
   a. Use semantic similarity of titles/descriptions
   b. Group by shared publishers/sources when helpful
3. Count articles per cluster per time period
4. Calculate trend metrics:
   a. Source count delta (current vs previous period)
   b. Velocity (accelerating/growing/steady/cooling)
   c. Emergence threshold (articles > 5 → Emerging, > 10 → Growing)
5. Determine central question shift:
   a. Compare dominant clusters between periods
   b. Draft question reflecting shift in editorial focus
6. Render suggestion report with before/after comparisons
```

**Skills Used:**
- Pattern recognition across article sets
- Comparative analysis between time periods

**Constraints:**
- Suggestions must cite specific article counts backing each claim
- Never invent perspectives — only surface what the article collection supports
- Central questions should be 8-15 words, action-oriented
- Synthesis paragraphs must reference at least 3 distinct perspectives

**Example Invocation:**

```
analysis-agent for topic: ai-superrace
compare state: 30 DAYS AGO → TODAY
suggest: updated positions, statuses, and central question
```

---

### Agent: Writing Assistant

**ID:** `writing-assistant`

**Role:** Refines all narrative text in a topic — summaries, syntheses, descriptions, central questions — ensuring editorial quality and consistent tone.

**Inputs:**
- Full topic JSON
- Mode selection: `draft` (new content), `refine` (improve existing), `audit` (check quality)

**Outputs:**
- Revised narrative text ready for inclusion in topic JSON
- Audit report if mode is `audit` (flagged inconsistencies, tone issues)

**Workflow (Draft/Refine):**

```
1. Review current narrative text across all perspectives and states
2. Identify areas needing improvement:
   a. Repetitive phrasing across perspectives
   b. Inconsistent terminology between related perspectives
   c. Weak or vague central questions
   d. Synthesis that doesn't integrate perspectives effectively
3. Rewrite iteratively:
   a. Ensure each perspective summary is unique and distinctive
   b. Central questions should show clear progression across periods
   c. Synthesis should answer: what do the perspectives collectively reveal?
   d. Maintain the publication's authoritative, measured tone
4. Output revised text organized by field for easy merge
```

**Workflow (Audit):**

```
1. Check cross-perspective uniqueness (no two summaries say the same thing)
2. Verify central question evolution shows meaningful progression
3. Flag any perspective whose description overlaps significantly with another (>40%)
4. Check that all source article titles are descriptive and accurate
5. Report: issues found, severity level, recommended fixes
```

**Skills Used:**
- Editorial writing standards
- Comparative text analysis

**Constraints:**
- Tone: authoritative, analytical, measured — never sensationalist
- Length discipline: perspective summaries ~40-60 words, syntheses ~50-80 words, central questions ~8-15 words
- Present tense, active voice preferred
- No hyperbole, no unqualified predictions

**Example Invocation:**

```
writing-assistant, mode: refine
topic: ai-superrace
focus: perspective summaries and central questions
tone check: ensure it reads as serious editorial, not tech blog
```

---

### Agent: Content Manager

**ID:** `content-manager`

**Role:** Manages the lifecycle of topic data — creates new topic entries, migrates data between formats, validates structural integrity, handles backups.

**Inputs:**
- Operation type: `create-new`, `migrate`, `validate`, `backup`, `restore`
- Supporting data (template, source file, etc.)

**Outputs:**
- Created/migrated/validated files as appropriate
- Execution log confirming all operations completed

**Workflow (Create New Topic):**

```
1. Load template from templates/topic.json
2. Populate required fields:
   a. slug — kebab-case identifier
   b. title, subtitle — compelling headline pair
   c. kicker — section label
   d. nav — navigation button labels
   e. perspectives — initial perspective catalog with summaries, source lists
3. Generate three default states:
   a. Period labels: "[X] DAYS AGO", "TODAY" (adjust for multi-period)
   b. Assign initial positions based on expected importance ordering
   c. Set initial opacities (invisible = 0, prominent = 1)
4. Validate against schema
5. Save as data/topics/{slug}.json
```

**Workflow (Migrate from HTML):**

```
1. Parse current monolithic HTML to extract:
   a. states[] array from const declaration
   b. perspectiveBodies{} object
   c. details{} object
   d. relations array
2. Transform extracted structures into topic JSON schema
3. Preserve all numerical values, positions, opacity data exactly
4. Add category assignments if missing
5. Output verified JSON file
```

**Workflow (Validate):**

```
1. Check JSON validity (parseable, correct types)
2. Verify all states have identical node keys (same 5 perspectives)
3. Ensure article URLs are syntactically valid (if present)
4. Check sparkline arrays match state count (always 3 elements)
5. Verify source counts in nodes align with linked article arrays
6. Flag orphaned or mismatched data
```

**Skills Used:**
- Structured data validation
- Format conversion
- Schema management

**Constraints:**
- Never modify published data without confirmation output
- Back up topic file before any migration/transform operation
- Maintain exact numeric precision for positions and opacities

**Example Invocation:**

```
content-manager, operation: migrate
source: editorial_perspective_evolution_v3.html
output: data/topics/ai-superrace.json
```

---

## 6. Skill Definitions (OpenCode)

These are reusable skill configurations for recurring workflows in your editorial process.

---

### Skill: New Topic Creation

**ID:** `new-topic-creation`

**Purpose:** Step-by-step guided workflow for creating a new Editorial Perspective Map topic from scratch.

**When to activate:** When starting a new topic analysis — whenever you want to add a fresh subject to the publication.

**Steps:**

```markdown
1. Define the topic
   - Choose a topic that generates genuine editorial disagreement
   - Write a headline-style title and explanatory subtitle
   - Pick 4-6 perspectives that represent distinct viewpoints
   - Create a nav label and kicker

2. Establish perspectives
   - For each perspective: write a one-paragraph summary explaining its editorial stance
   - Assign a category color (tech/human/econ/infra/platform)
   - List 3+ representative source articles per perspective

3. Create initial state (baseline — oldest period)
   - Position perspectives according to likely relative coverage then
   - Mark high-coverage perspectives as Dominant/Growing
   - Mark underrepresented ones as Invisible/Emerging
   - Write the baseline central question
   - Write the baseline synthesis

4. Create middle state (intermediate period)
   - Adjust positions, sizes, opacities reflecting coverage shifts
   - Update perspective descriptions to reflect intermediate phase
   - Draft the transitional central question
   - Write intermediate synthesis

5. Create final state (today/current)
   - Finalize all positions based on current editorial landscape
   - Set final central question and synthesis
   - Ensure question progression tells a coherent story

6. Validate and review
   - Run data-validation skill to check structural integrity
   - Run writing-assistant agent to polish all narrative text
   - Verify source attribution is complete for all perspectives

7. Export and save
   - Generate topic JSON file in data/topics/
   - Confirm it follows the schema defined in Section 4
```

**Output artifact:** `data/topics/{topic-slug}.json` ready for the generator pipeline.

---

### Skill: Period Update Flow

**ID:** `period-update-flow`

**Purpose:** Structured process for advancing a topic to its next time period — the most common maintenance task.

**When to activate:** When you've collected enough new articles to warrant updating a topic's latest state and want to advance the timeline.

**Steps:**

```markdown
1. Gather new material
   - Run research-agent for the topic using recent keywords
   - Collect articles from the most recent window (e.g., last 30 days)
   - Note any significant editorial events or shifts

2. Analyze shifts
   - Run analysis-agent comparing old-final-state → new-state
   - Capture: which perspectives gained/lost coverage
   - Identify any new themes or declining angles
   - Draft central question for the new state

3. Update the data
   - Append new state to topic JSON states array
   - Adjust node positions, sizes, opacities
   - Set source counts and statuses
   - Update relation connections if relevant

4. Update perspective bodies
   - Add new description variants for each perspective covering the extended timeline
   - Update sparkline data (add new point)
   - Update history arrays (remove oldest, add newest)
   - Append new source articles to perspective catalogs

5. Refresh synthesis and questions
   - Update the latest state's question and synthesis
   - Ensure question progression still reads naturally across all states
   - Verify synthesis captures cumulative insight

6. Validate and preview
   - Run data-validation skill
   - Optionally run writing-assistant to check prose quality
   - Inspect generated output visually
```

**Output artifact:** Updated `data/topics/{topic-slug}.json` with appended state(s).

---

### Skill: Data Validation

**ID:** `data-validation`

**Purpose:** Comprehensive validation pass on topic data to catch structural errors, inconsistencies, and edge cases before publishing.

**When to activate:** After any content modification — new topic creation, period updates, article additions, or data migrations. Treat this as your pre-publish checklist.

**Validation Checks:**

```markdown
Structure checks:
  ☐ Valid JSON syntax
  ☐ Required top-level keys present (slug, title, states, perspectives)
  ☐ States array has exactly 3 elements (or matches declared count)
  ☐ All states share identical node keys (same perspectives in every period)
  ☐ Navigation array has 3-7 buttons
  ☐ Date field parses as valid ISO date

Position and sizing checks:
  ☐ All x coordinates are 0-100 (percentage valid)
  ☐ All y coordinates are 0-100 (percentage valid)
  ☐ All w dimensions are positive and ≤100
  ☐ All h dimensions are positive and ≤100
  ☐ Border radius strings parse correctly (4 values / 4 values format)
  ☐ Opacity values are 0-1 floating point

Data alignment checks:
  ☐ Sparkline arrays match states array length
  ☐ History arrays match states array length
  ☐ perspectiveBodies key arrays match states array length
  ☐ Node source counts are non-negative integers
  ☐ Article source arrays exist for every perspective

Narrative quality checks:
  ☐ No empty or whitespace-only text fields
  ☐ Central questions are between 5 and 25 words
  ☐ Synthesis paragraphs are between 20 and 120 words
  ☐ Perspective summaries are between 15 and 80 words
  ☐ Central questions show meaningful progression (not duplicated)
  ☐ No more than 50% text overlap between consecutive perspective descriptions

Source integrity checks:
  ☐ Each perspective has at least 3 source articles
  ☐ Source article titles are descriptive (not just "Analysis" or "Update")
  ☐ Publisher names are formatted consistently (all caps)
  ☐ No duplicate article titles within the same perspective

Cross-cutting checks:
  ☐ Relation pairs reference actual node keys
  ☐ No dangling references
  ☐ Category colors are assigned to all perspectives
  ```

**Output format:** Checklist with pass/fail for each item, plus detail messages for any failures.

---

### Skill: Design System

**ID:** `design-system`

**Purpose:** Standardized configuration and auditing of the visual design system — colors, typography, spacing, responsive breakpoints, and accessibility.

**When to activate:** When making visual/layout changes, adding new UI elements, or performing a visual audit of the publication.

**Areas of Control:**

```markdown
Design tokens (defined in variables.css):
  Colors:
    - Primary brand palette (bg, card, ink, muted, line)
    - Status accent colors (blue, green, orange, purple)
    - Blob category tints (tech, human, econ, infra, platform)
  Spacing scale (8px-based rhythm)
  Border radius tokens
  Shadow tokens (card, map, modal)
  Typography scales (display, heading, body, caption)
  Z-index layers

Component audits:
  - Header bar (sticky positioning, backdrop blur)
  - Hero section (typography scale, responsive break)
  - Navigation (active state, hover behavior)
  - Map canvas (orbit rings, center button, blob shapes)
  - Change sheet (grid columns, animation)
  - Lens modal (spacing, grid layout, sparkline container)
  - Timeline slider (accent color, tick labels)
  - Synthesis block (prose treatment, kicker styling)
  - Sources panel (article card grid, source attribution)
  - Footer (breathing room, typography)

Responsive breakpoints:
  - ≥850px: Full desktop layout
  - 561-849px: Tablet layout (reduced typography, adjusted map)
  - ≤560px: Mobile layout (center button repositioned, blob stacking, collapsed grids)

Accessibility targets:
  - Minimum contrast ratio 4.5:1 for body text
  - Touch target minimum 44×44px for all interactive elements
  - Keyboard navigable (Escape to close modals/sheets)
  - Semantic HTML landmarks maintained
  - aria-label attributes on icon-only buttons
```

**Output artifact:** Audit report with issue list and severity ratings, or updated CSS variable set if modifying the token system.

---

## 7. Feature Roadmap

Phased implementation plan addressing the pain points identified earlier.

### Phase 1: Foundation (Immediate)

**Goal:** Migrate from single-file to structured architecture. No new functionality — just better organization.

| Task | Description | Related Agent/Skill |
|------|-------------|---------------------|
| Data migration | Extract hardcoded data from HTML into `data/topics/ai-superrace.json` | Content Manager (migrate operation) |
| Template separation | Move CSS/JS out of HTML into separate files in `src/` | Design System skill |
| Generator script | `tools/generate-site.mjs` — reads topic JSON + template → outputs publishable HTML | Content Manager |
| Data validation | Implement validation checks as pre-publish step | Data Validation skill |
| README update | Document the new directory structure and workflow | — |

**Deliverable:** Same visual product running on clean architecture, data stored in JSON.

### Phase 2: Research Integration

**Goal:** Replace mock article data with real scraped/aggregated content.

| Task | Description | Related Agent/Skill |
|------|-------------|---------------------|
| Research agent implementation | Automate article discovery via web search | Research Agent |
| Article cache format | Define and implement `data/articles/articles_cache.json` schema | Content Manager |
| Deduplication logic | Prevent adding the same article twice | Research Agent |
| Priority publisher list | Per-topic configurable publisher preference list | Content Manager |
| Initial article ingestion | Run on "ai-superrace" to populate real article data | Research Agent |

**Deliverable:** First topic with real sourced articles replacing mock data.

### Phase 3: Writer Workflow

**Goal:** Make content creation faster and higher-quality through AI assistance.

| Task | Description | Related Agent/Skill |
|------|-------------|---------------------|
| Writing assistant integration | Automated prose refinement for all narrative fields | Writing Assistant |
| Central question evolution | Tool to verify natural progression across states | Writing Assistant (audit) |
| Perspective uniqueness checker | Detect and flag overlapping perspective summaries | Writing Assistant (audit) |
| Bulk update workflow | Update all 3 states' narrative simultaneously | Period Update Flow skill |

**Deliverable:** Faster content iteration cycle with higher editorial consistency.

### Phase 4: Multi-Topic Support

**Goal:** Allow selecting between different topic analyses in the same application.

| Task | Description | Related Agent/Skill |
|------|-------------|---------------------|
| Topic selector UI | Dropdown/navigation to switch between topics | Design System |
| Dynamic loading | Runtime fetch of selected topic JSON | Content Loader (new module) |
| Topic indexing | Index/manifest of available topics | Content Manager |
| Per-topic nav configuration | Customize navigation per topic | New Topic Creation skill |

**Deliverable:** Application capable of hosting multiple topic analyses simultaneously.

### Phase 5: Reader Features (Future)

**Goal:** Enable reader interaction and feedback loops.

| Task | Description | Related Agent/Skill |
|------|-------------|---------------------|
| Reader article suggestions | Form for submitting source articles | Research Agent (reader input handler) |
| Comment/annotation system | Lightweight commenting on perspectives | — (would need backend) |
| Topic voting | Readers indicate interest in future topics | — (would need backend) |
| Newsletter export | Email digest of latest perspective updates | — (would need backend/service) |

**Deliverable:** Interactive community features. *Requires server infrastructure.*

---

## 8. Technical Constraints & Decisions

### Static-First Constraint

The publication will remain deployable to static hosting (GitHub Pages, Netlify, Cloudflare Pages). This means:

- All data transformations happen at build time, not runtime
- The generator pipeline (`generate-site.mjs`) assembles the final HTML from template + data
- No server-side rendering, no API endpoints, no runtime database
- Future reader features (Phase 5) would require separate infrastructure decisions

### Editor-in-the-Loop Principle

AI agents and automation assist, but a human decides. Specifically:

- Agents suggest perspective clusters, statuses, central questions
- A human approves or rejects each suggestion before it enters the topic data
- Agents draft prose; a human edits and finalizes all narrative
- No fully automated publish cycle until trust and accuracy are verified

### Data Persistence Model

- Topic JSON files are the single source of truth
- Article cache is transient/predictable — can be regenerated by re-running the Research agent
- No migrations required between versions; topic JSON is additive (new states append)
- Backup strategy: git commits of `data/topics/` serve as version history

### Visual Fidelity Lock

The current visual design is considered fixed at V3. Architecture changes (Phase 1) must produce pixel-identical output. Any future visual changes require explicit sign-off documented in Release Notes.

### Performance Boundaries

Given the current DOM-based rendering approach:

- Safe zone: up to 7 perspectives × 5 states comfortably
- At 10+ perspectives, consider switching from direct DOM manipulation to virtual DOM or canvas-based rendering
- Sparkline SVGs are lightweight; lazy-load lens modals only on demand
- No pagination needed — all content fits in single-page scroll for current scope

---

## 9. Next Steps

### What to Do First

The highest-impact, lowest-risk starting point is **Phase 1: Foundation**. Here's the concrete sequence:

1. **Run the Content Manager** with migration operation to extract all data from the current HTML file into `data/topics/ai-superrace.json`
2. **Split the HTML file** into template + CSS + JS modules following the directory structure in Section 3
3. **Write the generator script** (`tools/generate-site.mjs`) that combines template + data → final HTML
4. **Implement the Data Validation skill** as a pre-publish checkpoint
5. **Verify the migrated output** matches the current HTML exactly

This gives you all the structural benefits of the target architecture without changing anything the reader sees.

### Quick Reference: Agent/Skill Matrix

| Agent | Skill | Triggers On | Produces |
|-------|-------|-------------|----------|
| Research Agent | New Topic Creation | "Add a new topic..." | Fresh topic data in `data/topics/` |
| Research Agent | Period Update Flow | "Advance the timeline for..." | New state with real articles |
| Analysis Agent | Period Update Flow | "Analyze how things shifted..." | Updated node data, statuses, questions |
| Writing Assistant | New Topic Creation | "Write the narrative for..." | Polished prose for all fields |
| Writing Assistant | Period Update Flow | "Review and refine the new content" | Quality-checked updates |
| Content Manager | Any modification | Before committing/publishing | Validated, backed-up data files |
| Data Validation | Pre-publish gate | "Validate this topic" | Pass/fail checklist |
| Design System | Visual changes | "Check/update the styling" | Audit report or updated tokens |

---

*End of Specification v0.1*
