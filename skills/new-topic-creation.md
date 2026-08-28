# New Topic Creation

Guided workflow for creating a new topic from scratch (SPECv4 §8.1).

1. Define the topic (human-led)
   - Choose a topic with genuine editorial disagreement
   - Headline-style title + subtitle; nav label + kicker
   - Pick 4-6 perspectives representing distinct editorial lenses

2. Establish perspectives
   - Per perspective: summary, core argument, counterargument
   - Assign category (tech/human/econ/infra/platform)
   - Run: npm run pipeline -- stage=research topic=<slug>
     (accessPolicies resolved per publisher registry)

3. Baseline state (oldest period) — positions/statuses by relative coverage;
   baseline central question + synthesis

4. Intermediate state(s) — coverage shifts, transitional question

5. Current state — run analysis + writing stages on the real corpus;
   ensure question progression tells a coherent story

6. Validate and review
   - npm run validate
   - Writing Assistant audit mode
   - Verify accessPolicy for every source

7. Export
   - content-manager: create-new → data/topics/<slug>.json; manifest updated

Output: validated topic JSON, ready for generate-site.