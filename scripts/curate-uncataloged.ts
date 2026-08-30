/**
 * curate-uncataloged — Phase 1 (A+C): assign every real cached article that
 * isn't on a perspective source list to a lane via a two-tier heuristic
 * (publisher rules → title keywords). Articles matching nothing land in a
 * review bucket. DRY-RUN by default; `--apply` writes the topic + cache.
 */
import { readFileSync, writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");

const topic = JSON.parse(readFileSync("data/topics/ai-superrace.json", "utf8"));
const cache = JSON.parse(readFileSync("data/articles/articles_cache.json", "utf8"));

// ── cataloged set ──
const cataloged = new Set<string>();
for (const p of topic.perspectives as Array<any>) {
  for (const id of p.sources as string[]) cataloged.add(id);
}

// ── Tier 1: publisher rules ──
const PUBLISHER_RULES: Array<[RegExp, string]> = [
  [/power magazine|datacenterknowledge|data center knowledge|jll/i, "infrastructure"],
  [/moodys|moody's|rbc|bessem|tradingview|pymnts|fortune|autorit/i, "economics"],
  [/mit sloan|yale|harvard|st\.?\s?john|built in|nationalacademies|national academies|nist|oag|news\b|newsletter/i, "human-impact"],
  [/cfr|council on foreign/i, "platform"],
];

// ── Tier 2: title keywords (priority order) ──
const TITLE_RULES: Array<[RegExp, string]> = [
  [/\b(jobs?|workforce|labou?r|education|students?|skills?|governance|regulat|safety|divide|displac|society|policy)\b/i, "human-impact"],
  [/\b(data[- ]?centers?|power|grids?|energ(?:y|ies)|compute|chips?|semiconductors?|siting|electricity|infrastructure)\b/i, "infrastructure"],
  [/\b(value|econom|market|pricing|price|cost|investment|bubble|surplus|revenue|competition|antitrust|monetiz)\b/i, "economics"],
  [/\b(platform|agents?|distribution|defaults?|ecosystem|endpoint|interface)\b/i, "platform"],
];

function assign(publisher: string, title: string): { lane: string; rule: string } {
  for (const [re, lane] of PUBLISHER_RULES) {
    if (re.test(publisher)) return { lane, rule: `publisher:${re.source}` };
  }
  for (const [re, lane] of TITLE_RULES) {
    if (re.test(title)) return { lane, rule: `title:${re.source}` };
  }
  return { lane: "review", rule: "no match" };
}

const real = (cache.articles as Array<any>).filter((a) => a.id > "source-015");
const rows: Array<{ id: string; publisher: string; title: string; lane: string; rule: string }> = [];
let alreadyCataloged = 0;

for (const a of real) {
  if (cataloged.has(a.id)) {
    alreadyCataloged++;
    continue;
  }
  const { lane, rule } = assign(a.publisher as string, a.title as string);
  rows.push({ id: a.id, publisher: a.publisher, title: (a.title as string).slice(0, 60), lane, rule });
}

const byLane = new Map<string, number>();
for (const r of rows) byLane.set(r.lane, (byLane.get(r.lane) ?? 0) + 1);

console.log(`uncataloged real articles: ${rows.length} | already cataloged: ${alreadyCataloged}`);
console.log(`proposed lanes: ${[...byLane.entries()].map(([l, n]) => `${l}=${n}`).join(" | ")}`);
console.log("");
for (const r of rows) {
  console.log(`${r.lane.padEnd(14)} ${r.id} [${r.publisher}] ${r.title}  (${r.rule})`);
}

if (APPLY && rows.length) {
  for (const r of rows) {
    if (r.lane === "review") continue;
    const p = (topic.perspectives as Array<any>).find((x) => x.id === r.lane);
    if (p && !p.sources.includes(r.id)) p.sources.push(r.id);
    const a = (cache.articles as Array<any>).find((x) => x.id === r.id);
    if (a) a.perspectives = [r.lane];
  }
  writeFileSync("data/topics/ai-superrace.json", `${JSON.stringify(topic, null, 2)}\n`);
  writeFileSync("data/articles/articles_cache.json", `${JSON.stringify(cache, null, 2)}\n`);
  console.log(`\nAPPLIED: ${rows.filter((r) => r.lane !== "review").length} articles cataloged`);
} else {
  console.log(`\nDRY RUN — re-run with --apply to write`);
}