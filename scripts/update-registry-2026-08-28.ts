/**
 * Registry update 2026-08-28 — operator-directed license verification
 * (evidence gathered from publisher terms pages) + human-curated source
 * additions from the live AI-Superrace source scan.
 */
import { readFileSync, writeFileSync } from "node:fs";

const reg = JSON.parse(readFileSync("data/config/publishers.json", "utf8"));
const byName = new Map(reg.publishers.map((p: any) => [p.name, p]));
let updated = 0;
let added = 0;

// ---- 1. License verification results (evidence: publisher terms pages) ----
const conversation = byName.get("The Conversation");
if (conversation) {
  conversation.tier = 1;
  conversation.policy = {
    access: "open", license: "CC-BY-ND", reuse: "allowed_with_attribution",
    fullText: false, summary: true, link: true, pendingVerification: false,
  };
  conversation.notes =
    "VERIFIED 2026-08-28 via theconversation.com/republishing-guidelines: CC BY-ND 4.0 — free republication with attribution (authors + The Conversation link-back), no derivative edits, verbatim quotes allowed. fullText remains disabled per project v0.3 policy (excerpt handling not built).";
  updated++;
}

const brookings = byName.get("Brookings");
if (brookings) {
  brookings.tier = 2;
  brookings.policy = { ...brookings.policy, license: "copyright", reuse: "link_only", pendingVerification: false };
  brookings.notes =
    "VERIFIED 2026-08-28 via brookings.edu/terms-of-use: no CC license; content is Brookings property; personal non-commercial use only; reuse requires express written consent. Link + summarize only.";
  updated++;
}

const chatham = byName.get("Chatham House");
if (chatham) {
  chatham.tier = 2;
  chatham.policy = { ...chatham.policy, license: "copyright", reuse: "link_only", pendingVerification: false };
  chatham.notes =
    "VERIFIED 2026-08-28 via chathamhouse.org/terms-and-conditions + publications page: all rights reserved (Royal Institute of International Affairs); reuse licensed via PLSclear (charges >400 words). Link + summarize only.";
  updated++;
}

const pk = byName.get("Public Knowledge");
if (pk) {
  pk.tier = 2;
  pk.policy = { ...pk.policy, license: "copyright", reuse: "link_only", pendingVerification: false };
  pk.notes =
    "VERIFIED 2026-08-28 via publicknowledge.org (privacy/terms pages): no explicit content license found; default copyright applies (© 2026 Public Knowledge). Link + summarize only.";
  updated++;
}

// ---- 2. New sources — human-curated from live AI-Superrace source scan ----
// (66 Tavily results across 6 perspective lanes; license unverified → tier 3,
//  conservative link_only, pending verification)
const NEW_SOURCES: Array<{ name: string; notes: string }> = [
  { name: "McKinsey & Company", notes: "Curated 2026-08-28: 4 appearances in live AI-Superrace scan (agentic orgs, $7T data-center buildout, State of AI 2026). License unverified." },
  { name: "SemiAnalysis", notes: "Curated 2026-08-28: premier AI industry analysis ('AI Value Capture — The Shift To Model Labs'). License unverified." },
  { name: "Council on Foreign Relations", notes: "Curated 2026-08-28: U.S.-China AI rivalry analysis (2 results). License unverified." },
  { name: "Atlantic Council", notes: "Curated 2026-08-28: 'Powering AI' — AI energy/infrastructure analysis. License unverified." },
  { name: "World Economic Forum", notes: "Curated 2026-08-28: grid bottleneck + AI workforce education (2 lanes). License unverified." },
  { name: "Goldman Sachs Research", notes: "Curated 2026-08-28: 'Assumptions Shaping the Scale of the AI Build-Out'. License unverified." },
  { name: "Pew Research Center", notes: "Curated 2026-08-28: 'Views of AI Around the World' — public-opinion data. License unverified." },
  { name: "Bipartisan Policy Center", notes: "Curated 2026-08-28: 'AI and the Workforce' — jobs/displacement analysis. License unverified." },
  { name: "Fortune", notes: "Curated 2026-08-28: 'Has the AI race shifted from U.S. vs China to open vs closed?'. License unverified." },
  { name: "Interconnects", notes: "Curated 2026-08-28: independent specialist (Nathan Lambert) on AI labs/geopolitics. License unverified." },
  { name: "Astral Codex Ten", notes: "Curated 2026-08-28: independent analysis ('If Anyone Builds It, Everyone Dies' review). License unverified." },
  { name: "Works in Progress", notes: "Curated 2026-08-28: 'Why American data centers can't plug in' — infrastructure essays. License unverified." },
];

for (const src of NEW_SOURCES) {
  if (byName.has(src.name)) { console.log(`skip (exists): ${src.name}`); continue; }
  reg.publishers.push({
    name: src.name,
    tier: 3,
    policy: { access: "open", license: "unknown", reuse: "link_only", fullText: false, summary: true, link: true, pendingVerification: true },
    notes: src.notes,
  });
  added++;
}

writeFileSync("data/config/publishers.json", `${JSON.stringify(reg, null, 2)}\n`);
console.log(`registry updated: ${updated} verified, ${added} added, ${reg.publishers.length} total`);
