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

writeFileSync("data/topics/ai-superrace.json", `${JSON.stringify(topic, null, 2)}\n`);
writeFileSync("data/articles/articles_cache.json", `${JSON.stringify(cache, null, 2)}\n`);
console.log(`perspective sources updated: ${appended} real articles appended | ${tagsFixed} article tags corrected`);
for (const p of topic.perspectives) {
  console.log(`  ${p.id}: ${p.sources.length} sources`);
}
