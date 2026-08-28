const KEY = process.env.TAVILY_API_KEY;
if (!KEY) { console.error("TAVILY_API_KEY missing"); process.exit(1); }

const QUERIES: Record<string, string> = {
  technology: "AI frontier model race capability benchmarks analysis",
  platform: "AI agents platform distribution ecosystem advantage editorial",
  infrastructure: "AI data centers power chips compute constraint buildout",
  economics: "AI inference costs economics value capture productivity",
  human: "AI impact jobs education creativity workforce displacement",
  general: "AI superintelligence race analysis opinion",
  carnegie: "carnegieendowment.org copyright reprint permissions terms",
};

interface R { title: string; url: string; published_date?: string }

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "invalid"; }
}

const byDomain = new Map<string, { count: number; queries: Set<string>; samples: string[] }>();
const carnegieLines: string[] = [];

for (const [lane, query] of Object.entries(QUERIES)) {
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: KEY, query, max_results: 10, topic: "news", days: 45, search_depth: "basic" }),
  });
  if (!r.ok) { console.error(`${lane}: HTTP ${r.status}`); continue; }
  const j: any = await r.json();
  const results: R[] = j.results ?? [];
  console.log(`\n=== ${lane} (${results.length} results) ===`);
  for (const item of results) {
    const d = domainOf(item.url);
    console.log(`  [${d}] ${item.title.slice(0, 80)}`);
    if (lane === "carnegie") carnegieLines.push(`${item.url} :: ${item.title.slice(0, 80)}`);
    const e = byDomain.get(d) ?? { count: 0, queries: new Set<string>(), samples: [] };
    e.count++; e.queries.add(lane); if (e.samples.length < 2) e.samples.push(item.title.slice(0, 70));
    byDomain.set(d, e);
  }
}

console.log("\n\n===== PUBLISHER AGGREGATE (by appearances) =====");
for (const [d, e] of [...byDomain.entries()].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`${e.count}x  ${d}  lanes: ${[...e.queries].join(",")}`);
  for (const s of e.samples) console.log(`      · ${s}`);
}
console.log("\n===== CARNEGIE ENDOWMENT PERMISSIONS LEADS =====");
for (const l of carnegieLines) console.log(l);
