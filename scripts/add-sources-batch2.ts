/**
 * Registry additions 2026-08-28 (operator-curated list #2):
 * international + academic + industry sources for the AI Superrace corpus.
 * All tier 3 / license unknown / link_only pending verification (BBC and WEF
 * skipped — already registered).
 */
import { readFileSync, writeFileSync } from "node:fs";

const reg = JSON.parse(readFileSync("data/config/publishers.json", "utf8"));

const ADD = [
  { name: "Folha de S.Paulo", notes: "Curated 2026-08-28 (operator): leading Brazilian newspaper — Latin American AI-race coverage. License unverified." },
  { name: "PBS", notes: "Curated 2026-08-28 (operator): US public broadcaster — accessible AI explainers and workforce coverage. License unverified." },
  { name: "CBS News", notes: "Curated 2026-08-28 (operator): US mainstream AI-race coverage. License unverified." },
  { name: "NDTV", notes: "Curated 2026-08-28 (operator): Indian mainstream — India's AI-strategy coverage. License unverified." },
  { name: "The Hindu", notes: "Curated 2026-08-28 (operator): Indian mainstream — India AI-policy analysis. License unverified." },
  { name: "South China Morning Post", notes: "Curated 2026-08-28 (operator): Hong Kong/China perspective — the China side of the AI race. License unverified." },
  { name: "Stanford News", notes: "Curated 2026-08-28 (operator): Stanford + HAI (Human-Centered AI Institute) — academic AI research coverage. License unverified." },
  { name: "University of Oxford", notes: "Curated 2026-08-28 (operator): Oxford research news — academic AI analysis. License unverified." },
  { name: "VentureBeat", notes: "Curated 2026-08-28 (operator): AI trade press (also surfaced in the live source scan). License unverified." },
  { name: "Online News Association", notes: "Curated 2026-08-28 (operator): industry case studies — journalism practice lens. License unverified." },
  { name: "Journal of Artificial Intelligence Research (JAIR)", notes: "Curated 2026-08-28 (operator): peer-reviewed AI research — open-access academic journal. License unverified." },
];

let added = 0;
for (const e of ADD) {
  if (reg.publishers.some((p: any) => p.name === e.name)) {
    console.log("exists:", e.name);
    continue;
  }
  reg.publishers.push({
    name: e.name,
    tier: 3,
    policy: { access: "open", license: "unknown", reuse: "link_only", fullText: false, summary: true, link: true, pendingVerification: true },
    notes: e.notes,
  });
  added++;
}

writeFileSync("data/config/publishers.json", `${JSON.stringify(reg, null, 2)}\n`);
console.log(`added: ${added} | skipped duplicates: ${ADD.length - added} | total: ${reg.publishers.length}`);