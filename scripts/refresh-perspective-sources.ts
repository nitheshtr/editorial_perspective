/**
 * refresh-perspective-sources — editorial curation 2026-08-28:
 * appends the real ingested articles to their perspectives' source lists
 * (with lane corrections where the MVP ingestion default-tagged everything
 * "technology"), so the live site shows real articles with working
 * READ ORIGINAL links. Article `perspectives` tags updated for consistency.
 */
import { readFileSync, writeFileSync } from "node:fs";

const topic = JSON.parse(readFileSync("data/topics/ai-superrace.json", "utf8"));
const cache = JSON.parse(readFileSync("data/articles/articles_cache.json", "utf8"));

// Curated lane mapping (editorial review 2026-08-28, informed by the
// analysis agent's cluster evidence — e.g. clusters 31/41/43 read as the
// human-impact governance/equity dimension)
const LANE: Record<string, string> = {
  "source-016": "technology", // CNBC — bigger models → cheaper smarter systems
  "source-020": "technology", // IBD — self-improving models / superintelligence
  "source-021": "technology", // TIME — the race to make AI build itself
  "source-025": "technology", // TIME — world models next frontier
  "source-031": "human-impact", // Carnegie — AI safety for the US and China
  "source-035": "human-impact", // Carnegie — AI adoption at population scale
  "source-036": "technology", // Brookings — China is running multiple AI races
  "source-039": "technology", // Brookings — competing AI strategies US/China
  "source-037": "platform", // Brookings — stop model providers picking winners
  "source-040": "platform", // Brookings — AI companies competing with customers
  "source-042": "infrastructure", // Brookings — data center boom → local prosperity
  "source-038": "human-impact", // Brookings — governing the AI transition
  "source-041": "human-impact", // Brookings — bridging the global AI divide
  "source-043": "human-impact", // Brookings — what national AI plans get wrong
  "source-048": "technology", // MIT Tech Review — AI model customization as architectural imperative
  "source-049": "technology", // MIT Tech Review — data infrastructure for AI agent success
  "source-050": "technology", // MIT Tech Review — startups chasing the next big thing in LLMs
  "source-051": "technology", // MIT Tech Review — what to expect from Google
  "source-052": "technology", // MIT Tech Review — rebuilding the data stack for AI
  "source-053": "technology", // MIT Tech Review — AI's future in an augmented workplace
  "source-054": "technology", // MIT Tech Review — the era of agentic chaos
  "source-055": "technology", // MIT Tech Review — AI needs a strong data fabric
  "source-056": "technology", // MIT Tech Review — AI benchmarks are broken
  "source-057": "technology", // MIT Tech Review — foundation for an autonomous enterprise
};

let tagsFixed = 0;
for (const a of cache.articles) {
  if (LANE[a.id] && JSON.stringify(a.perspectives) !== JSON.stringify([LANE[a.id]])) {
    a.perspectives = [LANE[a.id]];
    tagsFixed++;
  }
}

let appended = 0;
for (const p of topic.perspectives) {
  for (const [sid, lane] of Object.entries(LANE)) {
    if (lane === p.id && !p.sources.includes(sid)) {
      p.sources.push(sid);
      appended++;
    }
  }
}

// Mechanical sync: the current period's sourceVolume is DERIVED from the
// catalog — the blob's "N SOURCES" must equal the sources panel count.
// (Analysis proposes qualitative signals; volume is never estimated.)
const states = topic.states as Array<Record<string, any>>;
const lastState = states[states.length - 1];
let volumesSynced = 0;
for (const p of topic.perspectives as Array<any>) {
  const node = lastState.nodes[p.name];
  if (node?.metrics && node.metrics.sourceVolume !== p.sources.length) {
    node.metrics.sourceVolume = p.sources.length;
    volumesSynced++;
  }
  // Clamp: independent signals (distinct clusters) can never exceed the
  // cataloged source count.
  if (node?.metrics && node.metrics.independentSignals > node.metrics.sourceVolume) {
    node.metrics.independentSignals = node.metrics.sourceVolume;
  }
}

// Recency windows: article counts per perspective over 1 year / 3 months / 1
// week — bucketed by each article's date (ingestion date is the honest
// fallback when a publisher page exposes no publish date).
const nowMs = Date.now();
const DAY = 86_400_000;
const byIdDate = new Map((cache.articles as Array<any>).map((a) => [a.id, a.date as string]));
let windowsSet = 0;
for (const p of topic.perspectives as Array<any>) {
  const dates = (p.sources as string[]).map((id) => byIdDate.get(id)).filter(Boolean) as string[];
  const inWindow = (days: number) => dates.filter((d) => new Date(`${d}T00:00:00Z`).getTime() >= nowMs - days * DAY).length;
  const windows = { y: inWindow(365), q: inWindow(92), w: inWindow(7) };
  if (JSON.stringify(p.windows) !== JSON.stringify(windows)) windowsSet++;
  p.windows = windows;
}

writeFileSync("data/topics/ai-superrace.json", `${JSON.stringify(topic, null, 2)}\n`);
writeFileSync("data/articles/articles_cache.json", `${JSON.stringify(cache, null, 2)}\n`);
console.log(`perspective sources updated: ${appended} real articles appended | ${tagsFixed} article tags corrected | ${volumesSynced} sourceVolumes synced to catalog`);
for (const p of topic.perspectives) {
  console.log(`  ${p.id}: ${p.sources.length} sources`);
}
