/**
 * Curation 2026-08-28 — economics-scoped pull cleanup:
 * 1. REMOVE event-promotion pages (not editorial content): source-060, source-063
 * 2. Lane-curate the 4 legitimate Bloomberg pieces (MVP ingestion default-tagged
 *    everything "technology") + append to perspective source lists.
 * Operator-sanctioned editorial cleanup; removals documented in RELEASE_NOTES.
 */
import { readFileSync, writeFileSync } from "node:fs";

const REMOVE = new Set(["source-060", "source-063"]); // event promos, not editorial
const LANES: Record<string, { lane: string; why: string }> = {
  "source-058": { lane: "platform", why: "Agentic AI strategies — platform lane" },
  "source-059": { lane: "economics", why: "Charting disruption — economics/value lane" },
  "source-061": { lane: "human-impact", why: "Governance paradox — governance lens" },
  "source-062": { lane: "platform", why: "Race won at the endpoint — distribution lane" },
};

const cache = JSON.parse(readFileSync("data/articles/articles_cache.json", "utf8"));
const removed = cache.articles.filter((a: any) => REMOVE.has(a.id));
cache.articles = cache.articles.filter((a: any) => !REMOVE.has(a.id));

const topic = JSON.parse(readFileSync("data/topics/ai-superrace.json", "utf8"));
let retagged = 0;
let appended = 0;
for (const a of cache.articles as Array<any>) {
  const lane = LANES[a.id];
  if (!lane) continue;
  a.perspectives = [lane.lane];
  retagged++;
  const p = (topic.perspectives as Array<any>).find((x) => x.id === lane.lane);
  if (p && !p.sources.includes(a.id)) {
    p.sources.push(a.id);
    appended++;
  }
}

writeFileSync("data/articles/articles_cache.json", `${JSON.stringify(cache, null, 2)}\n`);
writeFileSync("data/topics/ai-superrace.json", `${JSON.stringify(topic, null, 2)}\n`);
console.log(`curation done: ${removed.length} event promos removed (${removed.map((r: any) => r.id).join(", ")}) | ${retagged} articles lane-tagged | ${appended} appended to perspective sources | cache now ${cache.articles.length}`);