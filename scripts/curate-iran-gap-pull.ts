/**
 * Iran gap-pull curation 2026-08-28: fills Sanctions & Economy (3) and
 * Regional Dynamics (6) from the gap-filling research pulls.
 * Excludes: YouTube video page, 2010 Wikipedia, 2016 pre-window Peterson,
 * State Dept policy page, Treasury press release (primary/official pages,
 * not editorial coverage).
 */
import { readFileSync, writeFileSync } from "node:fs";

const LANES: Record<string, string> = {
  "source-142": "sanctions-economy", // Iranian Studies — exports under sanctions
  "source-144": "sanctions-economy", // Washington Institute — oil exports vulnerable
  "source-146": "sanctions-economy", // BBC — sanctions vs regime
  "source-150": "regional-dynamics", // Foreign Affairs — the Gulf goes backward
  "source-151": "regional-dynamics", // Belfer — degradation of the proxy model
  "source-152": "regional-dynamics", // GlobalGuardian — escalation & spillover
  "source-153": "regional-dynamics", // Global Security Review — escalation trajectory
  "source-154": "regional-dynamics", // Middle East Forum — axis of instability
  "source-155": "regional-dynamics", // ISDP — Iran's regional proxies
};

const EXCLUDE = new Set(["source-143", "source-145", "source-147", "source-148", "source-149"]);

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

// Sync last-state volumes + clamp
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
console.log(`gap-pull curation done: ${tagged} lane-tagged | ${appended} appended | ${removed.length} excluded (${removed.map((r: any) => r.id).join(", ")}) | cache now ${cache.articles.length}`);
for (const p of topic.perspectives as Array<any>) {
  console.log(`  ${p.id}: ${p.sources.length} sources`);
}