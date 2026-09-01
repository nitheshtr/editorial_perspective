/**
 * import-review-table — operator article import (the review CSV is two-way):
 * reads operator-added rows from data/review/{slug}-review.csv, enriches via
 * webfetch (metadata), resolves accessPolicy from the publisher registry,
 * validates against the Source schema, and appends through the same
 * guards as the research stage. Duplicates (by URL) are skipped.
 *
 * Usage: bun scripts/import-review-table.ts [slug] [--dry-run]
 *        (slug default: ai-superrace)
 *
 * Operator row contract (columns per the review table):
 *   Topic | Source (publisher, authoritative) | Link of Article (required URL)
 *   Perspective Matching (lane id or name — operator-authoritative)
 *   Publish Date (YYYY-MM-DD or DD/MM/YY — ambiguous formats flagged)
 *   Confidence (recorded in the report, not persisted per-article)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { load } from "cheerio";

const slug = process.argv[2] && !process.argv[2].startsWith("--") && !process.argv[2].startsWith("data") ? process.argv[2] : "ai-superrace";
const dryRun = process.argv.includes("--dry-run");

// ── minimal CSV parser (quoted fields, "" escapes) ──
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); if (row.some((v) => v.trim() !== "")) rows.push(row); }
  return rows;
}

function normalizeDate(raw: string): { date: string; ambiguous: boolean } {
  const v = raw.trim();
  if (!v) return { date: new Date().toISOString().slice(0, 10), ambiguous: true };
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { date: v, ambiguous: false };
  const dmy = v.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})$/);
  if (dmy) {
    const yy = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return { date: `${yy}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`, ambiguous: true };
  }
  return { date: new Date().toISOString().slice(0, 10), ambiguous: true };
}

// ── load topic + cache + registry ──
const topic = JSON.parse(readFileSync(`data/topics/${slug}.json`, "utf8")) as any;
const cache = JSON.parse(readFileSync("data/articles/articles_cache.json", "utf8")) as any;
const registry = JSON.parse(readFileSync("data/config/publishers.json", "utf8")) as any;

const laneIds = new Map<string, string>();
for (const p of topic.perspectives) {
  laneIds.set(p.id.toLowerCase(), p.id);
  laneIds.set(p.name.toLowerCase(), p.id);
}

const cachedUrls = new Set(
  (cache.articles as Array<any>).map((a) => (a.url as string).replace(/\/$/, "").toLowerCase()),
);
let nextSourceNum = Math.max(
  0,
  ...(cache.articles as Array<any>).map((a) => parseInt(String(a.id).replace("source-", ""), 10) || 0),
) + 1;
let nextCluster = Math.max(
  0,
  ...(cache.articles as Array<any>).map((a) => parseInt(String(a.storyCluster).replace("cluster-", ""), 10) || 0),
) + 1;

function resolvePolicy(publisher: string) {
  const hit = (registry.publishers as Array<any>).find(
    (p) => p.name.toLowerCase() === publisher.toLowerCase(),
  );
  if (hit) return { policy: hit.policy, known: true };
  return {
    policy: {
      access: "open", license: "unknown", reuse: "link_only",
      fullText: false, summary: true, link: true, pendingVerification: true,
    },
    known: false,
  };
}

// ── parse the review CSV ──
const csvPath = `data/review/${slug}-review.csv`;
if (!readFileSync(csvPath, "utf8")) throw new Error("review csv missing");
const rows = parseCsv(readFileSync(csvPath, "utf8"));
const header = rows[0].map((h) => h.trim().toLowerCase());
const col = (name: string) => header.findIndex((h) => h.includes(name));
const cTopic = col("topic"), cSource = col("source"), cLink = col("link"),
  cPersp = col("perspective"), cDate = col("publish"), cConf = col("confidence");

const newRows: any[] = [];
const report: string[] = [];

for (const r of rows.slice(1)) {
  const url = (r[cLink] ?? "").trim();
  if (!url || !/^https?:\/\//.test(url)) continue;
  const urlNorm = url.replace(/\/$/, "").toLowerCase();
  if (cachedUrls.has(urlNorm)) continue; // already in cache
  const publisher = (r[cSource] ?? "").trim() || "Unknown";
  const perspectiveRaw = (r[cPersp] ?? "").trim();
  const lane = laneIds.get(perspectiveRaw.toLowerCase());
  const { date, ambiguous } = normalizeDate(r[cDate] ?? "");
  const confidence = (r[cConf] ?? "").trim();
  const host = (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } })();

  if (host.startsWith("sponsored.")) { report.push(`SKIP sponsored: ${url}`); continue; }
  if (!lane) { report.push(`SKIP unknown perspective "${perspectiveRaw}": ${url}`); continue; }

  const { policy, known } = resolvePolicy(publisher);
  const id = `source-${String(nextSourceNum).padStart(3, "0")}`;
  nextSourceNum++;
  newRows.push({
    id,
    publisher,
    title: (r[cLink] ? "" : "") || publisher, // refined by fetch below when present
    description: "",
    date,
    type: "REPORT",
    url,
    accessPolicy: policy,
    storyCluster: `cluster-${nextCluster++}`,
    originalReporting: false,
    stance: "neutral",
    perspectives: [lane],
    _confidence: confidence,
    _ambiguousDate: ambiguous,
    _publisherKnown: known,
  });
  report.push(`QUEUED ${id} [${publisher}] → ${lane} | ${url.slice(0, 70)}`);
}

console.log(`import scan: ${newRows.length} new | ${report.filter((r) => r.startsWith("SKIP")).length} skipped`);
for (const line of report) console.log(`  ${line}`);

// ── enrichment pass: fetch each new URL for title/description metadata ──
if (!dryRun && newRows.length) {
  for (const row of newRows) {
    try {
      const r = await fetch(row.url, {
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(15000),
      });
      if (r.ok) {
        const $ = load(await r.text());
        if (!row.title || row.title === row.publisher) {
          row.title = ($('meta[property="og:title"]').attr("content") || $("title").text() || row.publisher).trim().slice(0, 200);
        }
        if (!row.description) {
          row.description = ($('meta[property="og:description"]').attr("content") || $('meta[name="description"]').attr("content") || "").trim().slice(0, 400);
        }
        if (!row.date || row._ambiguousDate) {
          const jp = $('meta[property="article:published_time"]').attr("content");
          if (jp && /^\d{4}-\d{2}-\d{2}/.test(jp)) { row.date = jp.slice(0, 10); row._ambiguousDate = false; }
        }
      }
    } catch { /* fetch failure → metadata stays operator-supplied */ }
    delete row._confidence; delete row._ambiguousDate; delete row._publisherKnown;
    delete row._titleFallback;
  }
  // strip helper fields
  for (const row of newRows) { delete row._confidence; delete row._ambiguousDate; delete row._publisherKnown; }

  cache.articles.push(...newRows);

  // append to perspective source lists + registry tier-3 for unknown publishers
  for (const row of newRows) {
    const p = (topic.perspectives as Array<any>).find((x) => x.id === row.perspectives[0]);
    if (p && !p.sources.includes(row.id)) p.sources.push(row.id);
    const known = (registry.publishers as Array<any>).some(
      (x) => x.name.toLowerCase() === row.publisher.toLowerCase(),
    );
    if (!known) {
      registry.publishers.push({
        name: row.publisher, tier: 3,
        policy: row.accessPolicy,
        notes: "Auto-added from operator review-table import; license unverified.",
      });
    }
  }

  // sync last-state volumes + clamps
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

  mkdirSync(dirname(`data/articles/articles_cache.json`), { recursive: true });
  writeFileSync(`data/articles/articles_cache.json`, `${JSON.stringify(cache, null, 2)}\n`);
  writeFileSync(`data/topics/${slug}.json`, `${JSON.stringify(topic, null, 2)}\n`);
  writeFileSync(`data/config/publishers.json`, `${JSON.stringify(registry, null, 2)}\n`);
  console.log(`IMPORTED: ${newRows.length} operator articles → cache ${cache.articles.length} | topic ${slug} sources synced`);
} else if (dryRun && newRows.length) {
  console.log(`DRY RUN: ${newRows.length} rows would be imported (re-run without --dry-run)`);
} else {
  console.log("no new operator rows to import");
}