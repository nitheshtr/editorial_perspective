/**
 * Curation 2026-08-28 #2 — editorial independence cleanup:
 * the 4 "Bloomberg" articles from the economics pull are SPONSORED
 * advertorials (sponsored.bloomberg.com — Salesforce/ServiceNow/Global X
 * paid campaigns), not Bloomberg journalism. Per SPECv4 §2.4 (editorial
 * independence) they are removed from the corpus and the Bloomberg registry
 * entry documents the exclusion.
 */
import { readFileSync, writeFileSync } from "node:fs";

const REMOVE = new Set(["source-058", "source-059", "source-061", "source-062"]);

const cache = JSON.parse(readFileSync("data/articles/articles_cache.json", "utf8"));
const removed = cache.articles.filter((a: any) => REMOVE.has(a.id));
cache.articles = cache.articles.filter((a: any) => !REMOVE.has(a.id));

const topic = JSON.parse(readFileSync("data/topics/ai-superrace.json", "utf8"));
let pruned = 0;
for (const p of topic.perspectives as Array<any>) {
  const before = p.sources.length;
  p.sources = p.sources.filter((id: string) => !REMOVE.has(id));
  pruned += before - p.sources.length;
}

const reg = JSON.parse(readFileSync("data/config/publishers.json", "utf8"));
const bloomberg = (reg.publishers as Array<any>).find((p) => p.name === "Bloomberg");
if (bloomberg) {
  bloomberg.notes =
    "Editorial Bloomberg is a legitimate future target (tier 3 pending license check). EXCLUSION RULE (verified 2026-08-28): sponsored.bloomberg.com URLs are paid advertorials (Salesforce/ServiceNow/Global X campaigns) — excluded from the corpus per SPECv4 §2.4; research stage auto-skips sponsored.* hostnames. Ingest only www.bloomberg.com/news/ editorial.";
  writeFileSync("data/config/publishers.json", `${JSON.stringify(reg, null, 2)}\n`);
}

writeFileSync("data/articles/articles_cache.json", `${JSON.stringify(cache, null, 2)}\n`);
writeFileSync("data/topics/ai-superrace.json", `${JSON.stringify(topic, null, 2)}\n`);
console.log(`curation #2 done: ${removed.length} sponsored pieces removed (${removed.map((r: any) => r.id).join(", ")}) | ${pruned} entries pruned from perspective source lists | cache now ${cache.articles.length}`);