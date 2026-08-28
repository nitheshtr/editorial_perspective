import { readFileSync, writeFileSync } from "node:fs";

const reg = JSON.parse(readFileSync("data/config/publishers.json", "utf8"));

const ADD = [
  {
    name: "The New York Times",
    tier: 2,
    policy: {
      access: "metered", license: "copyright", reuse: "link_only",
      fullText: false, summary: true, link: true, pendingVerification: true,
    },
    notes:
      "Curated 2026-08-28 (operator): mainstream AI-race opinion/coverage. Paywalled — research fetch skips non-open pages automatically; metadata + link only. License unverified.",
  },
  {
    name: "The Wall Street Journal",
    tier: 2,
    policy: {
      access: "metered", license: "copyright", reuse: "link_only",
      fullText: false, summary: true, link: true, pendingVerification: true,
    },
    notes:
      'Curated 2026-08-28 (operator): mainstream AI-race coverage. Legacy mock entry "WALL STREET JOURNAL · TECH" exists from v3 migration; this clean entry is for live ingestion. License unverified.',
  },
];

for (const e of ADD) {
  if (reg.publishers.some((p: any) => p.name === e.name)) {
    console.log("exists:", e.name);
    continue;
  }
  reg.publishers.push(e);
  console.log("added:", e.name);
}

writeFileSync("data/config/publishers.json", `${JSON.stringify(reg, null, 2)}\n`);
console.log("total:", reg.publishers.length);