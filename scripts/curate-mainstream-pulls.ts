/**
 * Curation 2026-08-30 — mainstream-publisher pulls (operator-directed):
 * CNN / BBC / Al Jazeera / WSJ / NDTV / The Hindu / SCMP, post-Feb-2026.
 * - 12 Iran-conflict pieces cataloged onto iran lanes
 * - 7 RU-pull legit pieces pre-tagged onto russia-ukraine lanes (first cycle next)
 * - 8 excluded: social/video/wiki/tracker pages + pre-window items
 */
import { readFileSync, writeFileSync } from "node:fs";

const IRAN: Record<string, string> = {
  "source-156": "military-security", // BBC — how the Israel-Iran conflict started
  "source-157": "regional-dynamics", // AJ — world reacts to Israel's attacks
  "source-158": "regional-dynamics", // AJ — world reacts to US attacks
  "source-159": "military-security", // BBC — missile strikes near Israeli nuclear facility
  "source-160": "military-security", // AJ — Iran targets US bases in Jordan
  "source-161": "sanctions-economy", // AJ — retaliation against countries joining the economic war
  "source-162": "sanctions-economy", // AJ — first post-ceasefire sanctions wave
  "source-163": "sanctions-economy", // AJ — new bank sanctions for economic pressure
  "source-164": "society-human-cost", // CNN — Iranian Americans divided six months in
  "source-165": "diplomacy-nuclear", // SCMP — nuclear diplomacy returns to square one
  "source-167": "diplomacy-nuclear", // SCMP — fresh talks to end the nuclear deadlock
  "source-168": "sanctions-economy", // SCMP — UN sanctions return, survival question
};

const RU: Record<string, string> = {
  "source-126": "battlefield-attrition", // CSIS — the war's next chapter
  "source-128": "battlefield-attrition", // Futura Doctrina — Ukraine's attrition campaign
  "source-129": "diplomacy-peace", // Brookings — what price for peace
  "source-131": "battlefield-attrition", // Atlantic Council — drones alone won't force Putin
  "source-132": "diplomacy-peace", // PBS — front-line progress + US-brokered talks
  "source-133": "battlefield-attrition", // IB Media — Russia intensifies attacks
  "source-135": "diplomacy-peace", // ICDS — the unfading mirage of negotiation
};

const EXCLUDE = new Set([
  "source-166", // SCMP 2022 — pre-window
  "source-127", // RAND 2023 — pre-window for the 2-year RU timeline
  "source-130", // YouTube video page
  "source-134", // Wikipedia page (2022)
  "source-136", // CFR tracker page (2015)
  "source-137", // YouTube video page
  "source-138", // Facebook post
]);

const cache = JSON.parse(readFileSync("data/articles/articles_cache.json", "utf8"));
const removed = cache.articles.filter((a: any) => EXCLUDE.has(a.id));
cache.articles = cache.articles.filter((a: any) => !EXCLUDE.has(a.id));

const topicI = JSON.parse(readFileSync("data/topics/iran-conflict.json", "utf8"));
const topicR = JSON.parse(readFileSync("data/topics/russia-ukraine.json", "utf8"));
let iranCat = 0;
let ruCat = 0;
let tags = 0;

for (const a of cache.articles as Array<any>) {
  const iranLane = IRAN[a.id];
  const ruLane = RU[a.id];
  if (iranLane) {
    a.perspectives = [iranLane];
    tags++;
    const p = (topicI.perspectives as Array<any>).find((x) => x.id === iranLane);
    if (p && !p.sources.includes(a.id)) { p.sources.push(a.id); iranCat++; }
  } else if (ruLane) {
    a.perspectives = [ruLane];
    tags++;
    const p = (topicR.perspectives as Array<any>).find((x) => x.id === ruLane);
    if (p && !p.sources.includes(a.id)) { p.sources.push(a.id); ruCat++; }
  }
}

// Sync last-state volumes for both topics
for (const t of [topicI, topicR] as Array<any>) {
  const states = t.states as Array<any>;
  const lastState = states[states.length - 1];
  for (const p of t.perspectives as Array<any>) {
    const node = lastState.nodes[p.name];
    if (node?.metrics) {
      node.metrics.sourceVolume = (p.sources as string[]).length;
      if (node.metrics.independentSignals > node.metrics.sourceVolume) {
        node.metrics.independentSignals = node.metrics.sourceVolume;
      }
    }
  }
}

writeFileSync("data/articles/articles_cache.json", `${JSON.stringify(cache, null, 2)}\n`);
writeFileSync("data/topics/iran-conflict.json", `${JSON.stringify(topicI, null, 2)}\n`);
writeFileSync("data/topics/russia-ukraine.json", `${JSON.stringify(topicR, null, 2)}\n`);
console.log(`mainstream curation done: ${removed.length} excluded (${removed.map((r: any) => r.id).join(", ")}) | ${tags} lane-tagged | iran +${iranCat} | russia-ukraine +${ruCat} | cache now ${cache.articles.length}`);
for (const p of topicI.perspectives as Array<any>) console.log(`  iran ${p.id}: ${p.sources.length}`);
for (const p of topicR.perspectives as Array<any>) console.log(`  ru ${p.id}: ${p.sources.length}`);