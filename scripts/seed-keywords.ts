/**
 * seed-keywords — deterministic backfill of per-perspective per-period
 * `keywords` + `periodSummary` for topics that have not run an Analysis
 * cycle yet (operator-approved placeholder, flagged in RELEASE_NOTES).
 *
 * Extraction (no LLM):
 *   - Bucket each cataloged source by publish-date month into the state
 *     window it falls in: state 0 = months <= periods[0]; state i =
 *     (periods[i-1], periods[i]].
 *   - Keyword score: title tokens count double, description tokens once;
 *     stopwords filtered; top 4-6 kept, ties broken alphabetically so the
 *     output is stable across runs.
 *   - States with <2 bucketed sources (or <2 qualifying keywords) are left
 *     without keywords/periodSummary — the fields are optional in the
 *     schema and the timeline card hides the chip row when absent.
 *
 * Usage: bun scripts/seed-keywords.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

const STOP = new Set([
  "the","and","for","with","that","this","from","are","was","were","has","have","had",
  "its","their","his","her","our","your","not","but","can","could","may","might","will",
  "would","than","then","them","they","there","here","what","when","where","which","who",
  "whom","why","how","all","any","are","after","before","between","into","onto","over",
  "under","about","across","among","amid","per","via","out","up","down","off","own","same",
  "such","more","most","less","least","very","just","also","only","even","still","yet",
  "new","now","next","last","first","two","three","one","says","said","say","report",
  "reports","analysis","opinion","update","live","amid","despite","while","week","month",
  "year","days","ago","against","being","been","does","did","doing","because","should",
]);

const tokenize = (text: string): string[] =>
  (text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []).filter((w) => !STOP.has(w));

const toMonths = (period: string): number => {
  const [y, m] = period.split("-").map(Number);
  return y * 12 + m;
};

const cap = (s: string): string =>
  s.length <= 24 ? s : s.slice(0, 23);

function extractKeywords(arts: { title: string; description: string }[]): string[] {
  const score = new Map<string, number>();
  const surfaces = new Map<string, Map<string, number>>(); // lower → original-case variants
  for (const a of arts) {
    const addToken = (w: string, weight: number) => {
      score.set(w, (score.get(w) ?? 0) + weight);
      const surface = w.charAt(0).toUpperCase() + w.slice(1);
      const isAllCaps =
        a.title.includes(w.toUpperCase()) || a.description.includes(w.toUpperCase());
      const isCap =
        isAllCaps || a.title.includes(surface) || a.description.includes(surface);
      if (!surfaces.has(w)) surfaces.set(w, new Map());
      const variants = surfaces.get(w)!;
      const key = isCap ? (isAllCaps ? w.toUpperCase() : surface) : w;
      variants.set(key, (variants.get(key) ?? 0) + 1);
    };
    for (const w of tokenize(a.title)) addToken(w, 2);
    for (const w of tokenize(a.description)) addToken(w, 1);
  }
  const display = (w: string): string => {
    const variants = surfaces.get(w);
    if (!variants || variants.size === 0) return w;
    return [...variants.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  };
  const ranked = [...score.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([w]) => display(w))
    .slice(0, 6);
  if (ranked.length >= 4) return ranked;
  // thin bucket: allow count-1 words to reach a usable chip row
  const singles = [...score.entries()]
    .filter(([w, n]) => n === 1 && !ranked.some((r) => r.toLowerCase() === w))
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([w]) => w);
  return [...ranked, ...singles].slice(0, 4);
}

function buildSummary(n: number, keywords: string[]): string {
  const kws = keywords.slice(0, 3);
  const list =
    kws.length <= 1
      ? kws[0] ?? "the period's core themes"
      : `${kws.slice(0, -1).join(", ")} and ${kws[kws.length - 1]}`;
  const sources = `${n} cataloged ${n === 1 ? "source" : "sources"}`;
  const sentence = `Coverage this period centers on ${list} across ${sources}.`;
  const words = sentence.split(/\s+/).length;
  if (words < 10) return `${sentence} Themes are drawn from that period's published articles.`;
  return sentence;
}

interface ArticleLite { id: string; title: string; description: string; date: string }

let seeded = 0;
let skipped = 0;
const slugs: string[] = JSON.parse(readFileSync("data/topics/index.json", "utf8"))
  .topics.map((t: { slug: string }) => t.slug);

for (const slug of slugs) {
  const path = `data/topics/${slug}.json`;
  const topic = JSON.parse(readFileSync(path, "utf8"));
  const cache = JSON.parse(readFileSync("data/articles/articles_cache.json", "utf8"));
  const byId = new Map<string, ArticleLite>(
    (cache.articles as ArticleLite[]).map((a) => [a.id, a]),
  );
  const periodMonths = topic.states.map((s: { period: string }) => toMonths(s.period));

  for (const p of topic.perspectives) {
    const arts = (p.sources ?? [])
      .map((id: string) => byId.get(id))
      .filter((a): a is ArticleLite => Boolean(a && a.date));

    topic.states.forEach((state: { period: string; nodes: Record<string, any> }, i: number) => {
      const node = state.nodes[p.name];
      if (!node) return;
      // Re-seed only our own template placeholders; real (authored/analysis)
      // data always wins.
      const isOwnPlaceholder =
        typeof node.periodSummary === "string" &&
        node.periodSummary.startsWith("Coverage this period centers on ");
      if (node.keywords && node.periodSummary && !isOwnPlaceholder) return;

      const hi = periodMonths[i];
      const lo = i === 0 ? -Infinity : periodMonths[i - 1];
      const bucket = arts.filter((a) => {
        const m = toMonths(a.date.slice(0, 7));
        return i === 0 ? m <= hi : m > lo && m <= hi;
      });
      if (bucket.length < 2) {
        skipped++;
        return;
      }
      const keywords = extractKeywords(bucket).map(cap);
      if (keywords.length < 2) {
        skipped++;
        return;
      }
      node.keywords = keywords;
      node.periodSummary = buildSummary(bucket.length, keywords);
      seeded++;
    });
  }

  writeFileSync(path, JSON.stringify(topic, null, 2) + "\n");
  console.log(`${slug}: topic file updated`);
}

console.log(`seeded ${seeded} perspective-periods; left ${skipped} empty (thin buckets)`);
