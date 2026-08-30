/**
 * generate-site — assembles the self-contained dist HTML from template +
 * topic JSON (IMPLEMENTATION.md §9.3). The data-block emitter reproduces
 * the V3 JS literal formatting byte-for-byte; the golden-file test is the
 * acceptance gate (Visual Fidelity Lock, SPECv4 §11).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { TopicView, ArticleCacheView, TopicManifest } from "./types.js";

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
const nameKey = (name: string) => (/\s/.test(name) ? q(name) : name);

interface SourceLite { publisher: string; title: string; description: string; url: string }

export function emitDataBlock(topic: TopicView, byId: Map<string, SourceLite>): string {
  const corpusReal = [...byId.values()].filter((s) => !s.url.includes("migrated.editorial.local")).length;
  const corpusLine = `const corpus={total:${byId.size},real:${corpusReal}};\n`;
  const names = topic.perspectives.map((p) => p.name);

  // ---- states ----
  const stateBlocks = topic.states.map((s) => {
    const nodeLines = names.map((n, i) => {
      const nd = s.nodes[n];
      if (!nd) throw new Error(`state "${s.label}" is missing node "${n}"`);
      const sep = i < names.length - 1 ? "," : "";
      const head =
        `      ${nameKey(n)}:{x:${num(nd.position.x)},y:${num(nd.position.y)},` +
        `w:${num(nd.size.w)},h:${num(nd.size.h)},br:${q(nd.borderRadius)},` +
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

  return corpusLine + states + nodeOrder + relations + perspectiveBodies + details;
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
  return inputs.template
    .replace("/*__CSS__*/", () => inputs.variablesCss + inputs.mainCss)
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
  if (all) {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "data/topics/index.json"), "utf8"),
    ) as TopicManifest;
    slugs = [manifest.active]; // MVP: one self-contained index.html for the active topic
  } else if (topicArg) {
    slugs = [topicArg];
  } else {
    console.error("usage: generate-site [--topic <slug> | --all] [--out dist] [--check] [--bless]");
    process.exit(2);
  }

  const root = process.cwd();
  let failed = false;
  for (const slug of slugs) {
    const html = generateHtmlFromFile(slug, root);
    const goldenPath = join(root, "tests/golden", `${slug}.html`);
    if (check || bless) {
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
      mkdirSync(join(root, outDir), { recursive: true });
      const outPath = join(root, outDir, "index.html");
      writeFileSync(outPath, html);
      console.log(`${slug}: wrote ${outPath} (${html.length}B)`);
    }
  }
  process.exit(failed ? 1 : 0);
}

if ((import.meta as unknown as { main?: boolean }).main) main();
