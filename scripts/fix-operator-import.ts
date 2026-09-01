/**
 * fix-operator-import — cleanup for the first operator CSV import:
 * 1. Cache publisher names: domain-style → proper (CNN, The Washington Post, China Daily)
 * 2. Registry: remove the 3 domain-style tier-3 junk entries; add proper
 *    The Washington Post + China Daily entries; CNN articles re-resolved to
 *    CNN's tier-2 policy
 * 3. source-171 type → OPINION (WaPo /opinions/ URL)
 * 4. Review CSV Source cells fixed so future imports resolve cleanly
 */
import { readFileSync, writeFileSync } from "node:fs";

const RENAME: Record<string, string> = {
  "cnn.com": "CNN",
  "www.washingtonpost.com": "The Washington Post",
  "https://www.chinadaily.com": "China Daily",
  "chinadaily.com": "China Daily",
};

const POLICIES: Record<string, any> = {
  "CNN": { access: "metered", license: "copyright", reuse: "link_only", fullText: false, summary: true, link: true, pendingVerification: true },
  "The Washington Post": { access: "metered", license: "copyright", reuse: "link_only", fullText: false, summary: true, link: true, pendingVerification: true },
  "China Daily": { access: "open", license: "copyright", reuse: "link_only", fullText: false, summary: true, link: true, pendingVerification: true },
};

// ── 1. cache: rename publishers + re-resolve policies + type fix ──
const cache = JSON.parse(readFileSync("data/articles/articles_cache.json", "utf8"));
let fixed = 0;
for (const a of cache.articles as Array<any>) {
  const target = RENAME[a.publisher];
  if (!target) continue;
  a.publisher = target;
  const reg = JSON.parse(readFileSync("data/config/publishers.json", "utf8"));
  const hit = (reg.publishers as Array<any>).find((p) => p.name === target);
  if (hit) a.accessPolicy = hit.policy;
  if (a.id === "source-171") a.type = "OPINION";
  fixed++;
}

// ── 2. registry: drop domain-style junk, add proper entries ──
const reg = JSON.parse(readFileSync("data/config/publishers.json", "utf8"));
const junkNames = new Set(Object.keys(RENAME));
const before = reg.publishers.length;
reg.publishers = (reg.publishers as Array<any>).filter((p) => !junkNames.has(p.name));
for (const name of ["CNN", "The Washington Post", "China Daily"]) {
  if (!reg.publishers.some((p: any) => p.name === name)) {
    reg.publishers.push({ name, tier: 2, policy: POLICIES[name], notes: "Proper entry added during operator-import cleanup 2026-08-30; license unverified." });
  }
}
writeFileSync("data/config/publishers.json", `${JSON.stringify(reg, null, 2)}\n`);

// ── 3. review CSV: fix the Source cells ──
const csvPath = "data/review/iran-conflict-review.csv";
let csv = readFileSync(csvPath, "utf8");
for (const [bad, good] of Object.entries(RENAME)) {
  csv = csv.split(`"${bad}"`).join(`"${good}"`);
  csv = csv.split(bad).join(good);
}
writeFileSync(csvPath, csv);

console.log(`fix done: ${fixed} cache articles re-published | registry ${before} → ${reg.publishers.length} | review CSV Source cells corrected`);