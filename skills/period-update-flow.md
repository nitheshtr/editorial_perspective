# Period Update Flow

One full pass of the SPECv4 §7 pipeline — the most common maintenance task.

1. Gather    npm run pipeline -- stage=research topic=<slug>
2. Analyze   npm run pipeline -- stage=analysis topic=<slug> run=<runId>
             → proposal set (P-ids) with metrics, statuses, question, synthesis
3. Draft     npm run pipeline -- stage=writing topic=<slug> run=<runId>
4. Approve   Human reviews proposals (or `npm run pipeline -- replay --run <id>`
             to revisit later); writes data/approvals/<runId>.json
             (or: npm run pipeline -- approve --run <id>)
5. Apply     npm run pipeline -- stage=apply topic=<slug> run=<runId>
             (backup → merge approved → validate → save; failure restores backup)
6. Publish   npm run generate; inspect dist/index.html; commit + push (CI deploys)

Note: steps 1-3 persist all artifacts; you can pause and return days later,
replaying or re-approving without any LLM calls (ADR-005).