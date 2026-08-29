# Data Validation

The pre-publish gate (SPECv4 §8.3), enforced mechanically by
tools/validate-topic.ts. Run after ANY content modification; mandatory
before publish.

  npm run validate                       # whole store
  npx tsx tools/validate-topic.ts <slug> # one topic
  --report json                          # machine-readable

Check catalog (summary):
- Structure: valid JSON, required keys, identical node keys across states,
  nav 3-7, ISO dates
- Geometry: x/y ∈ [0,100]; w/h ∈ (0,100]; border-radius format; opacity ∈ [0,1]
- Metrics: in range; status has confidence; independentSignals ≤ sourceVolume;
  Invisible requires emergence ≤ 0.05; arrays match state count;
  current-period sourceVolume == cataloged sources count
- Narrative: no empty fields; question 5-25 words; synthesis 20-120;
  summary 15-80; meaningful progression; ≤50% cross-perspective overlap
- Evidence: ≥3 sources per perspective; core argument AND counterargument;
  source IDs resolve in the article store; storyCluster on every source
- Licensing: accessPolicy on every source, consistent with the registry;
  reuse 'allowed_with_attribution' requires license ≠ unknown; no
  fullText: true as of v0.3; every source linkable; pendingVerification listed
- Relations: reference real perspective ids; strength ∈ [0,1]

Exit codes: 0 valid · 1 invalid · 2 error. Never publish on exit 1.