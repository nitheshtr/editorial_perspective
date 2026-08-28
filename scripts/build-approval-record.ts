/**
 * Build the human approval record for run 5eee94ce from the proposal set,
 * applying the orchestrator-recommended decisions (user-approved 2026-08-28).
 * Edits extract the `proposed`/`draft` string from {current, proposed} values.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const RUN = "5eee94ce-3e36-4f9a-beca-c6abc2881c8b";
const proposals = JSON.parse(
  readFileSync(`data/runs/${RUN}/analysis/proposals.json`, "utf8"),
).proposals;
const byId = Object.fromEntries(proposals.map((p: any) => [p.id, p]));

const decisions: Array<{ proposalId: string; decision: string; editedPayload?: unknown; note?: string }> = [];

// Edit: metrics proposals replaced the whole metrics object but omitted
// `status` (the LLM emitted status separately at node level — wrong path per
// schema). Fold the proposed status INTO a complete, valid metrics object.
const statusById: Record<string, string> = {
  "P-002": "proposed",
  "P-004": "proposed",
  "P-006": "proposed",
  "P-008": "proposed",
  "P-010": "proposed",
};
const metricToStatus: Record<string, string> = {
  "P-001": "P-002",
  "P-003": "P-004",
  "P-005": "P-006",
  "P-007": "P-008",
  "P-009": "P-010",
};
for (const id of ["P-001", "P-003", "P-005", "P-007", "P-009"]) {
  const metrics = { ...byId[id].value };
  const statusProposal = byId[metricToStatus[id]];
  metrics.status = statusProposal.value[statusById[statusProposal.id]];
  decisions.push({
    proposalId: id,
    decision: "edit",
    editedPayload: metrics,
    note: `Folded proposed status "${metrics.status}" into complete metrics object (LLM emitted status at node level; schema nests it in metrics)`,
  });
}
// Approve: improved perspective catalog summaries
for (const id of ["P-101", "P-102", "P-103", "P-104", "P-105"]) {
  decisions.push({ proposalId: id, decision: "approve" });
}
// Edit: extract the proposed string from {current, proposed} / {draft} values
const editKeys: Record<string, string> = {
  "P-011": "proposed",
  "P-012": "draft",
};
for (const [id, key] of Object.entries(editKeys)) {
  decisions.push({
    proposalId: id,
    decision: "edit",
    editedPayload: byId[id].value[key],
    note: `Extracted "${key}" string — raw value was an object, schema requires a string`,
  });
}
// Reject
const rejects: Record<string, string> = {
  "P-002": "Status folded into P-001 metrics edit (node-level path invalid per schema)",
  "P-004": "Status folded into P-003 metrics edit (node-level path invalid per schema)",
  "P-006": "Status folded into P-005 metrics edit (node-level path invalid per schema)",
  "P-008": "Status folded into P-007 metrics edit (node-level path invalid per schema)",
  "P-010": "Status folded into P-009 metrics edit (node-level path invalid per schema)",
  "P-013": "Structural report object would overwrite the states.2 object",
  "P-106": "Historical rewrite, conf 0.5 — keep baseline stable",
  "P-107": "Historical rewrite, conf 0.5 — keep baseline stable",
  "P-108": "Historical rewrite, conf 0.5 — keep baseline stable",
  "P-109": "Historical rewrite, conf 0.5 — keep baseline stable",
  "P-110": "Conflicts with approved P-011 (same path)",
  "P-111": "Conflicts with approved P-012 (same path)",
};
for (const [id, note] of Object.entries(rejects)) {
  decisions.push({ proposalId: id, decision: "reject", note });
}

const record = {
  run: RUN,
  decidedBy: "nitheshtr",
  decidedAt: new Date().toISOString(),
  decisions,
};

mkdirSync("data/approvals", { recursive: true });
writeFileSync(`data/approvals/${RUN}.json`, `${JSON.stringify(record, null, 2)}\n`);
console.log(`approval record written: ${decisions.length} decisions`);
