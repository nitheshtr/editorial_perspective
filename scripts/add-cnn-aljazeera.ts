import { readFileSync, writeFileSync } from "node:fs";

const reg = JSON.parse(readFileSync("data/config/publishers.json", "utf8"));
const ADD = [
  {
    name: "CNN", tier: 2,
    policy: { access: "metered", license: "copyright", reuse: "link_only", fullText: false, summary: true, link: true, pendingVerification: true },
    notes: "Curated 2026-08-30 (operator): mainstream US/International AI + conflict coverage. Metered — paywalled pages auto-skipped. License unverified.",
  },
  {
    name: "Al Jazeera", tier: 2,
    policy: { access: "open", license: "copyright", reuse: "link_only", fullText: false, summary: true, link: true, pendingVerification: true },
    notes: "Curated 2026-08-30 (operator): Middle East + Global coverage — strong Iran/Gulf lens. License unverified.",
  },
];
let added = 0;
for (const e of ADD) {
  if (reg.publishers.some((p: any) => p.name === e.name)) { console.log("exists:", e.name); continue; }
  reg.publishers.push(e);
  added++;
}
writeFileSync("data/config/publishers.json", `${JSON.stringify(reg, null, 2)}\n`);
console.log(`added: ${added} | total: ${reg.publishers.length}`);