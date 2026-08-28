/**
 * Approval record for run 6abea610 (user-approved 2026-08-28, recommended
 * record). Metrics edits fold the proposed status string into a complete
 * valid metrics object (LLM emitted status at node level — schema nests it
 * in metrics). Narrative summaries rejected: id-based paths don't resolve
 * against JSON arrays.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const RUN = "6abea610-c678-4f86-a663-3fc4b482c73f";
const proposals = JSON.parse(
  readFileSync(`data/runs/${RUN}/analysis/proposals.json`, "utf8"),
).proposals;
const byId = Object.fromEntries(proposals.map((p: any) => [p.id, p]));

const decisions: Array<{ proposalId: string; decision: string; editedPayload?: unknown; note?: string }> = [];

// Metrics edits — fold paired node-level status string into complete metrics
const metricToStatus: Record<string, string> = {
  "P-001": "P-002",
  "P-003": "P-004",
  "P-005": "P-006",
  "P-007": "P-008",
  "P-009": "P-010",
};
for (const id of ["P-001", "P-003", "P-005", "P-007", "P-009"]) {
  const metrics = { ...byId[id].value };
  metrics.status = byId[metricToStatus[id]].value; // status proposals are plain strings this run
  decisions.push({
    proposalId: id,
    decision: "edit",
    editedPayload: metrics,
    note: `Folded proposed status "${metrics.status}" into complete metrics object (node-level status path invalid per schema)`,
  });
}
// Node-level status proposals — folded, redundant
for (const id of ["P-002", "P-004", "P-006", "P-008", "P-010"]) {
  decisions.push({
    proposalId: id,
    decision: "reject",
    note: "Status folded into paired metrics edit (node-level path invalid per schema)",
  });
}
// Synthesis + question — clean strings this run
decisions.push({ proposalId: "P-011", decision: "approve" });
decisions.push({ proposalId: "P-012", decision: "approve" });
// Narrative summaries — id-based paths don't resolve on JSON arrays
for (const id of ["P-101", "P-102", "P-103", "P-104", "P-105"]) {
  decisions.push({
    proposalId: id,
    decision: "reject",
    note: "Path uses perspective id (perspectives.<id>.summary) which setByPath cannot resolve on an array — value would be lost on serialize; writing prompt to be contracted for numeric paths",
  });
}
// Conflicts + structural report
decisions.push({ proposalId: "P-106", decision: "reject", note: "Conflicts with approved P-012 (same path)" });
decisions.push({ proposalId: "P-107", decision: "reject", note: "Conflicts with approved P-011 (same path)" });
decisions.push({ proposalId: "P-013", decision: "reject", note: "String report at path states.2 would destroy the state object" });

const record = {
  run: RUN,
  decidedBy: "nitheshtr",
  decidedAt: new Date().toISOString(),
  decisions,
};

mkdirSync("data/approvals", { recursive: true });
writeFileSync(`data/approvals/${RUN}.json`, `${JSON.stringify(record, null, 2)}\n`);
console.log(`approval record written: ${decisions.length} decisions`);
