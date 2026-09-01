/**
 * generate-site — assembles self-contained per-topic dist HTML from template +
 * topic JSON (IMPLEMENTATION.md §9.3). The data-block emitter reproduces
 * the V3 JS literal formatting byte-for-byte; the golden-file test is the
 * acceptance gate (Visual Fidelity Lock, SPECv4 §11).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { TopicView, ArticleCacheView, TopicManifest, PerspectiveView } from "./types.js";

// ---- string/number emitters (V3 style) ----
// JS string-literal escaper: backslashes, quotes AND line terminators —
// a raw newline inside a single-quoted literal is a parse error that kills
// the whole app (found via the served-script parse check, 2026-08-28).
const q = (s: string) =>
  `'${s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")}'`;
const num = (n: number) => {
  const s = String(n);
  return s.startsWith("0.") ? s.slice(1) : s; // 0.35 -> .35, 1 -> 1
};
const nameKey = (name: string) => (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : q(name));

interface SourceLite { publisher: string; title: string; description: string; url: string }

// ---- canonical category fallbacks ----
// New topics are expected to carry an explicit `color` field per perspective;
// these fallbacks keep legacy / migrated topics rendering correctly.
const CATEGORY_COLORS: Record<string, string> = {
  tech: "#0071e3",
  technology: "#0071e3",
  platform: "#6e6e73",
  infra: "#27804f",
  infrastructure: "#27804f",
  econ: "#b45b00",
  economics: "#b45b00",
  human: "#6c56b8",
  "human-impact": "#6c56b8",
};

function perspectiveColor(p: PerspectiveView): string {
  if (p.color) return p.color;
  return CATEGORY_COLORS[p.category] ?? "#6e6e73";
}

function statusMeta(status: string): { text: string; cls: string } {
  switch (status) {
    case "Accelerating":
      return { text: "↑ ACCELERATING", cls: "up" };
    case "Growing":
      return { text: "↑ GROWING", cls: "up" };
    case "Cooling":
      return { text: "↓ COOLING", cls: "down" };
    case "Emerging":
      return { text: "✦ EMERGING", cls: "new" };
    case "Dominant":
      return { text: "● DOMINANT", cls: "dominant" };
    default:
      return { text: status, cls: "" };
  }
}

export function emitDataBlock(topic: TopicView, byId: Map<string, SourceLite>): string {
  const corpusReal = [...byId.values()].filter((s) => !s.url.includes("migrated.editorial.local")).length;
  const corpusLine = `const corpus={total:${byId.size},real:${corpusReal}};\n`;
  const timeline = buildTimeline(topic);
  const names = topic.perspectives.map((p) => p.name);

  // ---- category colors ----
  const categoryColorEntries = topic.perspectives.map((p, i) => {
    const sep = i < topic.perspectives.length - 1 ? "," : "";
    return `  ${nameKey(p.name)}:${q(perspectiveColor(p))}${sep}`;
  });
  const categoryColors = `const categoryColors={\n${categoryColorEntries.join("\n")}\n};\n`;

  const perspectiveColorEntries = topic.perspectives.map((p, i) => {
    const sep = i < topic.perspectives.length - 1 ? "," : "";
    return `  ${nameKey(p.id)}:${q(perspectiveColor(p))}${sep}`;
  });
  const perspectiveColors = `const perspectiveColors={\n${perspectiveColorEntries.join("\n")}\n};\n`;

  // ---- states ----
  const stateBlocks = topic.states.map((s) => {
    const nodeLines = names.map((n, i) => {
      const nd = s.nodes[n];
      if (!nd) throw new Error(`state "${s.label}" is missing node "${n}"`);
      const sep = i < names.length - 1 ? "," : "";
      const safeW = Math.max(nd.size.w, 22);
      const safeH = Math.max(nd.size.h, 18);
      const head =
        `      ${nameKey(n)}:{x:${num(nd.position.x)},y:${num(nd.position.y)},` +
        `w:${num(safeW)},h:${num(safeH)},br:${q(nd.borderRadius)},` +
        `sources:${num(nd.metrics.sourceVolume)},status:${q(nd.metrics.status)},` +
        `opacity:${num(nd.opacity)},`;
      if (nd.mobile) {
        const mOp = nd.mobile.opacity !== undefined ? `,opacity:${num(nd.mobile.opacity)}` : "";
        return `${head}\n        mobile:{x:${num(nd.mobile.x)},y:${num(nd.mobile.y)},w:${num(nd.mobile.w)},h:${num(nd.mobile.h)}${mOp}}}${sep}`;
      }
      return `${head.slice(0, -1)}}${sep}`;
    });
    return [
      "  {",
      `    label:${q(s.label)},`,
      `    question:${q(s.question)},`,
      `    synthesis:${q(s.synthesis)},`,
      `    lineStrength:${num(s.lineStrength)},`,
      "    nodes:{",
      ...nodeLines,
      "    }",
      "  }",
    ].join("\n");
  });
  const states = `const states=[\n${stateBlocks.join(",\n")}\n];\n`;

  // ---- nodeOrder / relations ----
  const nameOf = (id: string) => {
    const p = topic.perspectives.find((x) => x.id === id);
    if (!p) throw new Error(`relation references unknown perspective id "${id}"`);
    return p.name;
  };
  const nodeOrder = `const nodeOrder=[${names.map(q).join(",")}];\n`;
  const relations = `const relations=[${topic.relations
    .map((r) => `[${q(nameOf(r.from))},${q(nameOf(r.to))}]`)
    .join(",")}];\n`;

  // ---- perspectiveBodies ----
  const bodiesEntries = topic.perspectives.map((p, i) => {
    const sep = i < topic.perspectives.length - 1 ? "," : "";
    return `  ${nameKey(p.name)}:[${p.bodies.map(q).join(",")}]${sep}`;
  });
  const perspectiveBodies = `const perspectiveBodies={\n${bodiesEntries.join("\n")}\n};\n`;

  // ---- details ----
  const detailBlocks = topic.perspectives.map((p, i) => {
    const sep = i < topic.perspectives.length - 1 ? "," : "";
    const srcLines = p.sources.map((id, j) => {
      const s = byId.get(id);
      if (!s) throw new Error(`source id "${id}" not found in article cache`);
      const sSep = j < p.sources.length - 1 ? "," : "";
      // Real URLs are emitted for working "READ ORIGINAL" links; migrated
      // placeholder URLs are omitted so legacy cards keep their "#" href.
      const urlField = s.url && !s.url.includes("migrated.editorial.local") ? `,url:${q(s.url)}` : "";
      return `      {pub:${q(s.publisher)},title:${q(s.title)},desc:${q(s.description)}${urlField}}${sSep}`;
    });
    return [
      `  ${nameKey(p.name)}:{`,
      `    summary:${q(p.summary)},`,
      `    windows:{y:${p.windows?.y ?? 0},q:${p.windows?.q ?? 0},m:${p.windows?.m ?? 0},w:${p.windows?.w ?? 0}},`,
      `    sparkline:[${p.sparkline.map(num).join(",")}],`,
      `    history:[${p.history.map(q).join(",")}],`,
      "    sources:[",
      ...srcLines,
      "    ]",
      `  }${sep}`,
    ].join("\n");
  });
  const details = `const details={\n${detailBlocks.join("\n")}\n};\n`;

  return corpusLine + timeline + states + nodeOrder + relations + categoryColors + perspectiveColors + perspectiveBodies + details;
}

function buildTimeline(topic: TopicView): string {
  const entries = topic.states.map((s, i) => {
    const prev = i > 0 ? topic.states[i - 1] : null;
    const perspectiveLines = topic.perspectives.map((p, pi) => {
      const sep = pi < topic.perspectives.length - 1 ? "," : "";
      const theme = q(p.bodies[i]);
      let changed: string;
      if (i === 0) {
        changed = "Baseline period — initial snapshot of the conversation.";
      } else {
        const cur = s.nodes[p.name].metrics.sourceVolume;
        const prevVol = prev!.nodes[p.name].metrics.sourceVolume;
        const status = s.nodes[p.name].metrics.status;
        changed = `Sources ${cur >= prevVol ? "rose" : "fell"} from ${prevVol} to ${cur}. Status: ${status}.`;
      }
      return `    ${q(p.id)}:{theme:${theme},changed:${q(changed)}}${sep}`;
    });
    return [
      "  {",
      `    label:${q(s.label)},`,
      `    headline:${q(s.question)},`,
      "    perspectives:{",
      ...perspectiveLines,
      "    }",
      "  }",
    ].join("\n");
  });
  return `const timeline=[\n${entries.join(",\n")}\n];\n`;
}

// ---- per-topic HTML fragments ----

function slugDisplay(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.toUpperCase())
    .join(" ");
}

function slugCircle(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.toUpperCase())
    .join("<br>");
}

function buildNav(currentSlug: string): string {
  const aiActive = currentSlug === "ai-superrace" ? " active" : "";
  const conflictsActive = currentSlug === "iran-conflict" || currentSlug === "russia-ukraine" ? " active" : "";
  return [
    `<a class="nav-item${aiActive}" href="../ai-superrace/">AI</a>`,
    `<div class="dropdown">`,
    `  <button class="nav-item${conflictsActive}" aria-haspopup="true" aria-expanded="false">Conflicts</button>`,
    `  <ul class="dropdown-menu" role="menu">`,
    `    <li><a class="dropdown-item${currentSlug === "iran-conflict" ? " active" : ""}" href="../iran-conflict/" role="menuitem">Iran</a></li>`,
    `    <li><a class="dropdown-item${currentSlug === "russia-ukraine" ? " active" : ""}" href="../russia-ukraine/" role="menuitem">Russia-Ukraine</a></li>`,
    `  </ul>`,
    `</div>`,
    `<button class="nav-item">Global Economy</button>`,
  ].join("\n");
}

function buildTopicHeader(topic: TopicView): string {
  return [
    `<div class="label">${slugDisplay(topic.slug)} · PERSPECTIVE MAP</div>`,
    `<h2>${escapeHtml(topic.title)}</h2>`,
    `<div class="dek">${escapeHtml(topic.subtitle)}</div>`,
  ].join("\n");
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildTimelinePills(topic: TopicView): string {
  return topic.perspectives
    .map((p, i) => {
      const active = i === 0 ? " active" : "";
      const pressed = i === 0 ? "true" : "false";
      return `      <button class="perspective-pill${active}" type="button" data-key="${p.id}" onclick="selectPerspective('${qJsString(p.id)}')" aria-pressed="${pressed}">\n        <span class="legend-dot" style="background:var(--color-${p.id});"></span> ${escapeHtml(p.name)}\n      </button>`;
    })
    .join("\n");
}

function buildMap(topic: TopicView): string {
  const current = topic.states.length - 1;
  const state = topic.states[current];
  const blobs = topic.perspectives.map((p) => {
    const node = state.nodes[p.name];
    const meta = statusMeta(node.metrics.status);
    const body = p.bodies[current];
    const sources = node.metrics.sourceVolume;
    return `  <button class="blob ${p.category}" data-id="${escapeHtml(p.name)}" onclick="openPerspectiveLens('${qJsString(p.name)}')"><span class="trend ${meta.cls}">${meta.text}</span><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(body)}</p><div class="sources">${sources} SOURCES →</div></button>`;
  });
  const centerQuestion = escapeHtml(state.question);
  const circle = slugCircle(topic.slug);
  const center = `  <button class="center" onclick="document.getElementById('synthesis').scrollIntoView({behavior:'smooth'})"><small>CENTRAL TOPIC</small><span class="q-micro">THE QUESTION IS CHANGING</span><strong>${circle}</strong><span class="question" id="question">${centerQuestion}</span></button>`;
  return [...blobs, center].join("\n");
}

function buildDynamicCss(topic: TopicView): string {
  const rootVars = topic.perspectives
    .map((p) => `  --color-${p.id}:${perspectiveColor(p)};`)
    .join("\n");
  const pillRules = topic.perspectives
    .map((p) => `.perspective-pill.active[data-key="${p.id}"]{border-color:${perspectiveColor(p)}}`)
    .join("\n");
  return `:root{\n${rootVars}\n}\n${pillRules}`;
}

// Escape a string for use inside a single-quoted JS string literal in an inline onclick handler.
function qJsString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export interface GenerateInputs {
  topic: TopicView;
  articles: ArticleCacheView;
  template: string;
  variablesCss: string;
  mainCss: string;
  appJs: string;
}

export function generateHtml(inputs: GenerateInputs): string {
  const byId = new Map<string, SourceLite>(
    inputs.articles.articles.map((a) => [a.id, { publisher: a.publisher, title: a.title, description: a.description, url: a.url }]),
  );
  const dynamicCss = buildDynamicCss(inputs.topic);
  return inputs.template
    .replace("/*__CSS__*/", () => inputs.variablesCss + inputs.mainCss + "\n" + dynamicCss)
    .replace("<!--__NAV__-->", () => buildNav(inputs.topic.slug))
    .replace("<!--__TOPIC_HEADER__-->", () => buildTopicHeader(inputs.topic))
    .replace("<!--__MAP__-->", () => buildMap(inputs.topic))
    .replace("<!--__TIMELINE_PILLS__-->", () => buildTimelinePills(inputs.topic))
    .replace("/*__DATA__*/", () => emitDataBlock(inputs.topic, byId))
    .replace("/*__APP__*/", () => inputs.appJs);
}

export function loadAssets(root: string) {
  return {
    template: readFileSync(join(root, "src/index.html"), "utf8"),
    variablesCss: readFileSync(join(root, "src/css/variables.css"), "utf8"),
    mainCss: readFileSync(join(root, "src/css/main.css"), "utf8"),
    appJs: readFileSync(join(root, "src/js/app.js"), "utf8"),
  };
}

export function generateHtmlFromFile(slug: string, root = process.cwd()): string {
  const topic = JSON.parse(readFileSync(join(root, "data/topics", `${slug}.json`), "utf8")) as TopicView;
  const articles = JSON.parse(
    readFileSync(join(root, "data/articles/articles_cache.json"), "utf8"),
  ) as ArticleCacheView;
  return generateHtml({ topic, articles, ...loadAssets(root) });
}

function firstDiff(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}
const esc = (s: string) => JSON.stringify(s).slice(1, -1);

function buildRedirectPage(activeSlug: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=./${activeSlug}/">
<title>Redirecting…</title>
</head>
<body>
<p>Redirecting to <a href="./${activeSlug}/">${activeSlug}</a>…</p>
</body>
</html>`;
}

// ---- CLI (only when run directly; importable for tests) ----
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
  const hasFlag = (name: string) => process.argv.includes(`--${name}`);
  const all = hasFlag("all");
  const topicArg = arg("topic");
  const outDir = arg("out") ?? "dist";
  const check = hasFlag("check");
  const bless = hasFlag("bless");

  let slugs: string[];
  let activeSlug: string | undefined;
  if (all) {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "data/topics/index.json"), "utf8"),
    ) as TopicManifest;
    slugs = manifest.topics.map((t) => t.slug);
    activeSlug = manifest.active;
  } else if (topicArg) {
    slugs = [topicArg];
  } else {
    console.error("usage: generate-site [--topic <slug> | --all] [--out dist] [--check] [--bless]");
    process.exit(2);
  }

  const root = process.cwd();
  let failed = false;
  for (const slug of slugs) {
    const topicPath = join(root, "data/topics", `${slug}.json`);
    if (!existsSync(topicPath)) {
      console.log(`${slug}: skipped missing topic (${topicPath})`);
      continue;
    }

    const html = generateHtmlFromFile(slug, root);

    if (check || bless) {
      // Golden parity is kept only for the original ai-superrace topic.
      if (slug !== "ai-superrace") {
        console.log(`${slug}: golden parity skipped (only ai-superrace has a golden file)`);
        continue;
      }
      const goldenPath = join(root, "tests/golden", `${slug}.html`);
      if (!existsSync(goldenPath)) {
        writeFileSync(goldenPath, html);
        console.log(`${slug}: golden captured (${html.length}B)`);
        continue;
      }
      const golden = readFileSync(goldenPath, "utf8");
      const diffAt = firstDiff(golden, html);
      if (diffAt < 0 && golden.length === html.length) {
        console.log(`${slug}: PARITY OK (${html.length}B)`);
        continue;
      }
      failed = true;
      const from = Math.max(0, diffAt - 60);
      console.error(`${slug}: PARITY DRIFT at byte ${diffAt} (golden ${golden.length}B vs generated ${html.length}B)`);
      console.error(`  golden:    ...${esc(golden.slice(from, diffAt + 60))}...`);
      console.error(`  generated: ...${esc(html.slice(from, diffAt + 60))}...`);
      if (bless) {
        writeFileSync(goldenPath, html);
        console.error(`${slug}: golden re-captured (--bless) — RELEASE_NOTES entry required (Visual Fidelity Lock)`);
        failed = false;
      }
    } else {
      const topicOutDir = join(root, outDir, slug);
      mkdirSync(topicOutDir, { recursive: true });
      const outPath = join(topicOutDir, "index.html");
      writeFileSync(outPath, html);
      console.log(`${slug}: wrote ${outPath} (${html.length}B)`);
    }
  }

  // Emit root redirect when running --all.
  if (all && activeSlug && !check && !bless) {
    const redirectDir = join(root, outDir);
    mkdirSync(redirectDir, { recursive: true });
    const redirectPath = join(redirectDir, "index.html");
    writeFileSync(redirectPath, buildRedirectPage(activeSlug));
    console.log(`redirect: wrote ${redirectPath} → ./${activeSlug}/`);
  }

  process.exit(failed ? 1 : 0);
}

if ((import.meta as unknown as { main?: boolean }).main) main();
