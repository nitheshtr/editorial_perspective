/**
 * migrate-from-html — extracts the V3 monolithic HTML data block and
 * transforms it into the v0.4 topic schema (IMPLEMENTATION.md §9.4).
 * Numerics preserved exactly; all metrics synthesized as placeholders
 * (confidence capped at 0.5) pending Analysis review; every migrated
 * source gets an unknown/link_only/pendingVerification accessPolicy.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  TopicView,
  StateView,
  NodeView,
  PerspectiveView,
  SourceRefView,
  ArticleCacheView,
  PublishersView,
  TopicManifest,
} from "./types.js";

interface LegacyNode {
  x: number; y: number; w: number; h: number; br: string;
  sources: number; status: string; opacity: number;
  mobile?: { x: number; y: number; w: number; h: number; opacity?: number };
}
interface LegacyState {
  label: string; question: string; synthesis: string;
  lineStrength: number; nodes: Record<string, LegacyNode>;
}
interface LegacySource { pub: string; title: string; desc: string; }
interface LegacyDetails { summary: string; sparkline: number[]; history: string[]; sources: LegacySource[]; }
interface LegacyData {
  states: LegacyState[];
  nodeOrder: string[];
  relations: [string, string][];
  perspectiveBodies: Record<string, string[]>;
  details: Record<string, LegacyDetails>;
}

export function extractLegacyData(html: string): LegacyData {
  const dataStart = html.indexOf("const states=[");
  const dataEnd = html.indexOf("let current=2;");
  if (dataStart < 0 || dataEnd < 0 || dataEnd <= dataStart) {
    throw new Error("V3 data block not found (expected const states=[ ... let current=2;)");
  }
  const block = html.slice(dataStart, dataEnd);
  const fn = new Function(
    `${block}\nreturn { states, nodeOrder, relations, perspectiveBodies, details };`,
  );
  return fn() as LegacyData;
}

function match1(html: string, re: RegExp): string {
  const m = html.match(re);
  if (!m) throw new Error(`metadata extraction failed for ${re}`);
  return m[1].trim();
}

const idOf = (name: string) => name.toLowerCase().replace(/\s+/g, "-");
const CATEGORY_BY_KEYWORD: [RegExp, string][] = [
  [/tech/i, "tech"],
  [/infra/i, "infra"],
  [/econ/i, "econ"],
  [/human/i, "human"],
  [/platform/i, "platform"],
];
const categoryOf = (name: string) =>
  CATEGORY_BY_KEYWORD.find(([re]) => re.test(name))?.[1] ?? "platform";
const mapType = (pubType: string): string =>
  ["ANALYSIS", "REPORT", "OPINION", "FEATURE"].includes(pubType) ? pubType : "REPORT";
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** "90 DAYS AGO" relative to `today` → "2026-05"; "TODAY" → current month. */
function periodFromLabel(label: string, today: Date): string {
  const m = label.match(/(\d+)\s+DAYS\s+AGO/i);
  const d = new Date(today);
  if (m) d.setDate(d.getDate() - Number(m[1]));
  return d.toISOString().slice(0, 7);
}

export function buildMigration(
  slug: string,
  html: string,
  today: string,
): { topic: TopicView; articles: ArticleCacheView; publishers: PublishersView; manifest: TopicManifest } {
  const legacy = extractLegacyData(html);
  const todayDate = new Date(`${today}T00:00:00Z`);
  const names = legacy.nodeOrder;

  const title = match1(html, /<section class="topic">.*?<h2>([^<]+)<\/h2>/s);
  const subtitle = match1(html, /<div class="dek">([^<]+)<\/div>/);
  const kicker = match1(html, /<div class="eyebrow">([^<]+)<\/div>/);
  const navBlock = match1(html, /<nav>(.*?)<\/nav>/s);
  const nav = [...navBlock.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map((m) => m[1].trim());
  const activeNav = match1(html, /<button class="active">([^<]+)<\/button>/);

  // ---- states (numerics preserved exactly; metrics synthesized) ----
  const states: StateView[] = legacy.states.map((s, idx) => {
    const nodes: Record<string, NodeView> = {};
    const volumes = Object.values(s.nodes).map((n) => n.sources);
    const maxSources = Math.max(...volumes, 0);
    for (const name of names) {
      const n = s.nodes[name];
      const prev = idx > 0 ? legacy.states[idx - 1].nodes[name].sources : null;
      const momentum = prev === null ? 0.5 : round2(clamp01((n.sources - prev) / Math.max(prev, 1)));
      nodes[name] = {
        position: { x: n.x, y: n.y },
        size: { w: n.w, h: n.h },
        borderRadius: n.br,
        opacity: n.opacity,
        ...(n.mobile ? { mobile: { ...n.mobile } } : {}),
        metrics: {
          editorialWeight: maxSources > 0 ? round2(n.sources / maxSources) : 0,
          sourceVolume: n.sources,
          independentSignals: Math.max(0, Math.round(n.sources * 0.6)),
          momentum,
          emergence: 0.5,
          confidence: 0.5,
          status: n.status,
        },
      };
    }
    return {
      period: periodFromLabel(s.label, todayDate),
      label: s.label,
      question: s.question,
      synthesis: s.synthesis,
      lineStrength: s.lineStrength,
      nodes,
    };
  });

  // ---- sources: global ids across nodeOrder × details ----
  const articles: SourceRefView[] = [];
  const idsByName = new Map<string, string[]>();
  let clusterSeq = 0;
  for (const name of names) {
    const perspId = idOf(name);
    const ids: string[] = [];
    for (const src of legacy.details[name].sources) {
      clusterSeq += 1;
      const id = `source-${String(articles.length + 1).padStart(3, "0")}`;
      const pubType = src.pub.includes(" · ") ? src.pub.split(" · ").pop()!.trim() : "REPORT";
      articles.push({
        id,
        publisher: src.pub, // full verbatim string — parity depends on it
        title: src.title,
        description: src.desc,
        date: today,
        type: mapType(pubType),
        url: `https://migrated.editorial.local/${id}`,
        accessPolicy: {
          access: "open",
          license: "unknown",
          reuse: "link_only",
          fullText: false,
          summary: true,
          link: true,
          pendingVerification: true,
        },
        storyCluster: `cluster-${clusterSeq}`,
        originalReporting: false,
        stance: "neutral",
        perspectives: [perspId],
      });
      ids.push(id);
    }
    idsByName.set(name, ids);
  }

  // ---- perspectives ----
  const perspectives: PerspectiveView[] = names.map((name) => ({
    id: idOf(name),
    name,
    category: categoryOf(name),
    summary: legacy.details[name].summary,
    coreArgument: legacy.perspectiveBodies[name][legacy.perspectiveBodies[name].length - 1],
    counterArgument: "Migrated placeholder — pending Analysis Agent review.",
    bodies: [...legacy.perspectiveBodies[name]],
    sparkline: [...legacy.details[name].sparkline],
    history: [...legacy.details[name].history],
    sources: idsByName.get(name)!,
  }));

  // ---- relations ----
  const relations = legacy.relations.map(([a, b]) => ({
    from: idOf(a),
    to: idOf(b),
    strength: 0.5,
    reason: "Migrated relation from v3 (no strength data).",
  }));

  const topic: TopicView = {
    slug,
    title,
    subtitle,
    kicker,
    date: today,
    nav,
    activeNav,
    states,
    perspectives,
    relations,
  };

  const article: ArticleCacheView = {
    articles,
    migratedFrom: "editorial_perspective_evolution_v3.html",
  };

  // ---- publisher registry: §5.3 seeds + migrated mock publishers (tier 3) ----
  const seeds: PublishersView["publishers"] = [
    {
      name: "The Conversation", tier: 1,
      policy: { access: "open", license: "CC", reuse: "allowed_with_attribution", fullText: false, summary: true, link: true, pendingVerification: true },
      notes: "Republication generally permitted under Creative Commons with attribution; verify per-article license and no-derivatives scope before any excerpt use.",
    },
    { name: "Public Knowledge", tier: 1, policy: { access: "open", license: "unknown", reuse: "link_only", fullText: false, summary: true, link: true, pendingVerification: true }, notes: "Open-access analytical material; license unverified." },
    { name: "Brookings", tier: 1, policy: { access: "open", license: "unknown", reuse: "link_only", fullText: false, summary: true, link: true, pendingVerification: true }, notes: "Freely readable ≠ CC-licensed; verify per article." },
    { name: "Carnegie Endowment", tier: 1, policy: { access: "open", license: "unknown", reuse: "link_only", fullText: false, summary: true, link: true, pendingVerification: true }, notes: "Freely readable ≠ CC-licensed; verify per article." },
    { name: "Chatham House", tier: 1, policy: { access: "open", license: "unknown", reuse: "link_only", fullText: false, summary: true, link: true, pendingVerification: true }, notes: "Freely readable ≠ CC-licensed; verify per article." },
    { name: "Reuters", tier: 2, policy: { access: "open", license: "copyright", reuse: "link_only", fullText: false, summary: true, link: true, pendingVerification: false }, notes: "Explicitly commercializing content access; IP protection emphasized." },
    { name: "Associated Press", tier: 2, policy: { access: "open", license: "copyright", reuse: "link_only", fullText: false, summary: true, link: true, pendingVerification: false }, notes: "Terms forbid copying/display/transmission except as permitted." },
    { name: "BBC", tier: 2, policy: { access: "open", license: "copyright", reuse: "link_only", fullText: false, summary: true, link: true, pendingVerification: false } },
    { name: "NPR", tier: 2, policy: { access: "open", license: "copyright", reuse: "link_only", fullText: false, summary: true, link: true, pendingVerification: false } },
    { name: "The Guardian", tier: 2, policy: { access: "open", license: "copyright", reuse: "link_only", fullText: false, summary: true, link: true, pendingVerification: false } },
  ];
  const mockPubs = [...new Set(articles.map((a) => a.publisher))];
  const publishers: PublishersView = {
    publishers: [
      ...seeds,
      ...mockPubs.map((name) => ({
        name,
        tier: 3,
        policy: { access: "open", license: "unknown", reuse: "link_only", fullText: false, summary: true, link: true, pendingVerification: true },
        notes: "Migrated from v3 mock data.",
      })),
    ],
  };

  const manifest: TopicManifest = {
    topics: [{ slug, title, file: `${slug}.json`, added: today }],
    active: slug,
  };

  return { topic, articles: article, publishers, manifest };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

// ---- CLI ----
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const input = arg("in") ?? "editorial_perspective_evolution_v3.html";
const slug = arg("slug") ?? "ai-superrace";
const outDir = arg("out") ?? "data/topics";
const dryRun = hasFlag("dry-run");

const html = readFileSync(join(process.cwd(), input), "utf8");
const today = new Date().toISOString().slice(0, 10);
const { topic, articles, publishers, manifest } = buildMigration(slug, html, today);

const summary = [
  `migration of "${input}" → slug "${slug}" ${dryRun ? "(dry-run)" : ""}`,
  `  states: ${topic.states.length} | perspectives: ${topic.perspectives.length} | relations: ${topic.relations.length}`,
  `  sources: ${articles.articles.length} (all license unknown / link_only / pendingVerification)`,
  `  publishers: ${publishers.publishers.length} (10 spec seeds + migrated mocks)`,
  `  placeholder metrics: confidence capped at 0.5 — pending Analysis review`,
];

if (dryRun) {
  console.log(summary.join("\n"));
  process.exit(0);
}

const root = process.cwd();
writeJson(join(root, outDir, `${slug}.json`), topic);
writeJson(join(root, "data/articles/articles_cache.json"), articles);
writeJson(join(root, "data/config/publishers.json"), publishers);
writeJson(join(root, "data/topics/index.json"), manifest);
console.log([...summary, "  written: topics json, articles cache, publishers registry, manifest"].join("\n"));
