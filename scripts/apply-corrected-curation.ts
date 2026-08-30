/**
 * apply-corrected-curation — Phase 1 gate-approved mapping (operator-approved
 * 2026-08-28). All 68 uncataloged articles explicitly assigned; 8 excluded as
 * non-AI RSS noise. This IS the editorial record of the curation pass.
 */
import { readFileSync, writeFileSync } from "node:fs";

const LANE: Record<string, string> = {
  // technology (12)
  "source-044": "technology", "source-045": "technology", "source-046": "technology",
  "source-084": "technology", "source-085": "technology", "source-088": "technology",
  "source-089": "technology", "source-107": "technology", "source-108": "technology",
  "source-109": "technology", "source-118": "technology",
  "source-121": "technology",
  "source-102": "EXCLUDE", // Atlantic Council — Ukraine resilience (non-AI)
  // platform (13)
  "source-058": "platform", "source-059": "platform", "source-060": "platform",
  "source-076": "platform", "source-087": "platform", "source-090": "platform",
  "source-091": "platform", "source-093": "platform", "source-094": "platform",
  "source-095": "platform", "source-096": "platform", "source-097": "platform",
  "source-117": "platform",
  // economics (13)
  "source-061": "economics", "source-062": "economics", "source-063": "economics",
  "source-064": "economics", "source-067": "economics", "source-072": "economics",
  "source-073": "economics", "source-074": "economics", "source-075": "economics",
  "source-092": "economics", "source-105": "economics", "source-106": "economics",
  "source-120": "economics",
  // infrastructure (12)
  "source-047": "infrastructure", "source-066": "infrastructure", "source-068": "infrastructure",
  "source-069": "infrastructure", "source-070": "infrastructure", "source-071": "infrastructure",
  "source-111": "infrastructure", "source-112": "infrastructure", "source-113": "infrastructure",
  "source-114": "infrastructure", "source-115": "infrastructure", "source-116": "infrastructure",
  // human-impact (10)
  "source-065": "human-impact", "source-077": "human-impact", "source-078": "human-impact",
  "source-079": "human-impact", "source-080": "human-impact", "source-081": "human-impact",
  "source-082": "human-impact", "source-083": "human-impact", "source-086": "human-impact",
  "source-110": "human-impact",
  // EXCLUDE — non-AI sitewide-feed noise (8)
  "source-098": "EXCLUDE", "source-099": "EXCLUDE", "source-100": "EXCLUDE",
  "source-101": "EXCLUDE", "source-103": "EXCLUDE", "source-104": "EXCLUDE",
  "source-119": "EXCLUDE",
};

const topic = JSON.parse(readFileSync("data/topics/ai-superrace.json", "utf8"));
const cache = JSON.parse(readFileSync("data/articles/articles_cache.json", "utf8"));

const cataloged = new Set<string>();
for (const p of topic.perspectives as Array<any>) {
  for (const id of p.sources as string[]) cataloged.add(id);
}

let applied = 0;
let excluded = 0;
let skipped = 0;
for (const a of cache.articles as Array<any>) {
  if (a.id <= "source-015" || cataloged.has(a.id)) { skipped++; continue; }
  const lane = LANE[a.id];
  if (!lane) { console.log(`UNMAPPED: ${a.id} [${a.publisher}] ${a.title}`); continue; }
  if (lane === "EXCLUDE") { excluded++; continue; }
  const p = (topic.perspectives as Array<any>).find((x) => x.id === lane);
  if (p && !p.sources.includes(a.id)) p.sources.push(a.id);
  a.perspectives = [lane];
  applied++;
}

// Mechanical sync: last-state volumes + clamps + recency windows
const states = topic.states as Array<any>;
const lastState = states[states.length - 1];
const nowMs = Date.now();
const DAY = 86_400_000;
const byId = new Map((cache.articles as Array<any>).map((a) => [a.id, a]));
for (const p of topic.perspectives as Array<any>) {
  const node = lastState.nodes[p.name];
  if (node?.metrics) {
    node.metrics.sourceVolume = (p.sources as string[]).length;
    if (node.metrics.independentSignals > node.metrics.sourceVolume) {
      node.metrics.independentSignals = node.metrics.sourceVolume;
    }
  }
  const dates = (p.sources as string[]).map((id) => byId.get(id)?.date).filter(Boolean) as string[];
  const inWindow = (days: number) => dates.filter((d) => new Date(`${d}T00:00:00Z`).getTime() >= nowMs - days * DAY).length;
  p.windows = { y: inWindow(365), q: inWindow(92), m: inWindow(30), w: inWindow(7) };
}

writeFileSync("data/topics/ai-superrace.json", `${JSON.stringify(topic, null, 2)}\n`);
writeFileSync("data/articles/articles_cache.json", `${JSON.stringify(cache, null, 2)}\n`);
console.log(`APPLIED: ${applied} cataloged | ${excluded} excluded as non-AI | ${skipped} already cataloged`);
for (const p of topic.perspectives as Array<any>) {
  console.log(`  ${p.id}: ${p.sources.length} sources | windows y:${p.windows.y} q:${p.windows.q} m:${p.windows.m} w:${p.windows.w}`);
}