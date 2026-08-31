/**
 * generate-review-table — admin review artifact (operator request 2026-08-28):
 * an Excel-friendly CSV of every cataloged article for a topic, for manual
 * review and correction of perspective assignments.
 *
 * Usage: bun scripts/generate-review-table.ts [slug]   (default: ai-superrace)
 * Output: data/review/{slug}-review.csv (UTF-8 BOM so Excel reads unicode)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const slug = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "ai-superrace";

const topic = JSON.parse(readFileSync(`data/topics/${slug}.json`, "utf8"));
const cache = JSON.parse(readFileSync("data/articles/articles_cache.json", "utf8"));
const byId = new Map((cache.articles as Array<any>).map((a) => [a.id, a]));

// Confidence basis: major/verified publishers → High; domain-derived or
// niche sources → Medium. The operator overwrites during review.
function confidenceFor(publisher: string): string {
  const major = /conversation|brookings|economist|financial times|bloomberg|reuters|associated press|bbc|npr|the guardian|washington post|new york times|wall street journal|cnn|time|georgetown|csis|rand|cfr|council on foreign|atlantic council|inss|peterson|mit|stanford|harvard|yale|wef|pew/i;
  return major.test(publisher) ? "High" : "Medium";
}

const topicLabel = slug === "iran-conflict" ? "Conflict/Iran" : slug === "russia-ukraine" ? "Conflict/Russia-Ukraine" : `Topic/${slug}`;

const rows: string[] = [];
let n = 0;
for (const p of topic.perspectives as Array<any>) {
  for (const id of p.sources as string[]) {
    const a = byId.get(id);
    if (!a) continue;
    n += 1;
    const domain = (() => { try { return new URL(a.url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
    rows.push([
      String(n),
      topicLabel,
      a.publisher,
      a.url,
      p.name,
      a.date,
      confidenceFor(a.publisher),
      domain,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  }
}

const header = "Sl No,Topic,Source,Link of Article,Perspective Matching,Publish Date,Confidence,Source Domain";
const csv = `\uFEFF${header}\n${rows.join("\n")}\n`;
mkdirSync("data/review", { recursive: true });
writeFileSync(`data/review/${slug}-review.csv`, csv);
console.log(`review table written: data/review/${slug}-review.csv (${n} rows)`);
console.log("columns: Sl No | Topic | Source | Link of Article | Perspective Matching | Publish Date | Confidence | Source Domain");