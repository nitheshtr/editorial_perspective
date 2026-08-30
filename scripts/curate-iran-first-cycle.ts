/**
 * Iran first-cycle curation (operator-approved pattern): catalog 5 editorial
 * pieces onto iran-conflict lanes; EXCLUDE 2 non-editorial items (CFR 2019
 * conflict tracker — pre-window tracker page; Wikimedia — not a publisher).
 */
import { readFileSync, writeFileSync } from "node:fs";

const EXCLUDE = new Set(["source-123", "source-139"]);
const LANES: Record<string, string> = {
  "source-122": "military-security",
  "source-124": "diplomacy-nuclear",
  "source-125": "military-security",
  "source-140": "diplomacy-nuclear",
  "source-141": "society-human-cost",
};

const cache = JSON.parse(readFileSync("data/articles/articles_cache.json", "utf8"));
const removed = cache.articles.filter((a: any) => EXCLUDE.has(a.id));
cache.articles = cache.articles.filter((a: any) => !EXCLUDE.has(a.id));

const topic = JSON.parse(readFileSync("data/topics/iran-conflict.json", "utf8"));
let tagged = 0;
let appended = 0;
for (const a of cache.articles as Array<any>) {
  const lane = LANES[a.id];
  if (!lane) continue;
  a.perspectives = [lane];
  tagged++;
  const p = (topic.perspectives as Array<any>).find((x) => x.id === lane);
  if (p && !p.sources.includes(a.id)) {
    p.sources.push(a.id);
    appended++;
  }
}

// Sync last-state volumes to the catalog + clamp independent signals
const states = topic.states as Array<any>;
const lastState = states[states.length - 1];
for (const p of topic.perspectives as Array<any>) {
  const node = lastState.nodes[p.name];
  if (node?.metrics) {
    node.metrics.sourceVolume = (p.sources as string[]).length;
    if (node.metrics.independentSignals > node.metrics.sourceVolume) {
      node.metrics.independentSignals = node.metrics.sourceVolume;
    }
  }
}

writeFileSync("data/articles/articles_cache.json", `${JSON.stringify(cache, null, 2)}\n`);
writeFileSync("data/topics/iran-conflict.json", `${JSON.stringify(topic, null, 2)}\n`);
console.log(`iran curation done: ${tagged} lane-tagged | ${appended} appended to sources | ${removed.length} excluded (${removed.map((r: any) => r.id).join(", ")}) | cache now ${cache.articles.length}`);
for (const p of topic.perspectives as Array<any>) {
  console.log(`  ${p.id}: ${p.sources.length} sources`);
}