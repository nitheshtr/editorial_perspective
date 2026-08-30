/**
 * Approval record — Iran first editorial cycle (run 5664fb17, operator-approved
 * recommended record 2026-08-28). Metrics edits fold proposed statuses (the
 * analysis contract correctly omitted status — derived fields are folded at
 * approval); narrative summaries approved; duplicates rejected.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const RUN = "5664fb17-0a9a-4f02-94ec-8b907cc9c9d4";
const proposals = JSON.parse(
  readFileSync(`data/runs/${RUN}/analysis/proposals.json`, "utf8"),
).proposals;
const byId = Object.fromEntries(proposals.map((p: any) => [p.id, p]));

const STATUS_FOLD: Record<string, string> = {
  "P-001": "Accelerating", // Military & Security — the breakout lane
  "P-002": "Growing", // Diplomacy & Nuclear File
  "P-003": "Emerging", // Society & Human Cost
  "P-004": "Emerging", // Regional Dynamics
  "P-005": "Emerging", // Sanctions & Economy — 0 sources, coverage gap noted
};

// Catalog counts per lane (from the Iran curation: 5 editorial pieces)
const CATALOG_SV: Record<string, number> = {
  "P-001": 2, "P-002": 2, "P-003": 1, "P-004": 0, "P-005": 0,
};

const decisions: Array<{ proposalId: string; decision: string; editedPayload?: unknown; note?: string }> = [];

for (const [id, status] of Object.entries(STATUS_FOLD)) {
  const v = { ...byId[id].value };
  v.status = status;
  v.sourceVolume = CATALOG_SV[id]; // derived field: catalog count per lane
  if (v.independentSignals > v.sourceVolume) {
    v.independentSignals = v.sourceVolume; // clamp: signals ≤ catalog count
  }
  decisions.push({
    proposalId: id,
    decision: "edit",
    editedPayload: v,
    note: `Folded status "${status}" + derived sourceVolume ${v.sourceVolume} (catalog count); independentSignals clamped`,
  });
}
decisions.push({ proposalId: "P-006", decision: "approve" });
decisions.push({ proposalId: "P-007", decision: "approve" });
for (const id of ["P-101", "P-102", "P-103", "P-104", "P-105"]) {
  decisions.push({ proposalId: id, decision: "approve" });
}
decisions.push({ proposalId: "P-106", decision: "reject", note: "Duplicate path of approved P-006" });
decisions.push({ proposalId: "P-107", decision: "reject", note: "Duplicate path of approved P-007" });

const record = {
  run: RUN,
  decidedBy: "nitheshtr",
  decidedAt: new Date().toISOString(),
  decisions,
};

mkdirSync("data/approvals", { recursive: true });
writeFileSync(`data/approvals/${RUN}.json`, `${JSON.stringify(record, null, 2)}\n`);
console.log(`approval record written: ${decisions.length} decisions (${decisions.filter((d) => d.decision !== "reject").length} apply)`);