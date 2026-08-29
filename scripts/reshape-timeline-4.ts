/**
 * reshape-timeline-4 — one-off editorial reshape: 3 timeline states → 4
 * (1 YEAR AGO / 3 MONTHS AGO / 1 MONTH AGO / 1 WEEK AGO), per the operator's
 * timeline change. Content mapping:
 *   state 0 "1 YEAR AGO"   ← old state 0 verbatim (baseline narrative)
 *   state 1 "3 MONTHS AGO" ← old state 1 verbatim
 *   state 2 "1 MONTH AGO"  ← old state 2, sourceVolume restored to the
 *                            second-cycle approved analysis values
 *   state 3 "1 WEEK AGO"   ← clone of old state 2 + current catalog counts
 * Perspective bodies/sparkline/history gain a 4th entry (grounded in the
 * actually-ingested MIT/Brookings content).
 */
import { readFileSync, writeFileSync } from "node:fs";

const topic = JSON.parse(readFileSync("data/topics/ai-superrace.json", "utf8"));
const cache = JSON.parse(readFileSync("data/articles/articles_cache.json", "utf8"));
const byId = new Map(cache.articles.map((a: any) => [a.id, a]));

if (topic.states.length !== 3) throw new Error(`expected 3 states, found ${topic.states.length}`);

const old0 = topic.states[0];
const old1 = topic.states[1];
const old2 = topic.states[2];

// Second-cycle approved source volumes (state "1 MONTH AGO")
const APPROVED_SV: Record<string, number> = {
  Technology: 4, Platform: 7, Infrastructure: 5, Economics: 3, "Human Impact": 6,
};

// ── state 0 / 1: relabel + re-period ──
old0.label = "1 YEAR AGO";
old0.period = "2025-08";
old1.label = "3 MONTHS AGO";
old1.period = "2026-05";

// ── state 2: "1 MONTH AGO" — restore approved analysis volumes ──
old2.label = "1 MONTH AGO";
old2.period = "2026-07";
for (const [name, sv] of Object.entries(APPROVED_SV)) {
  if (old2.nodes[name]?.metrics) old2.nodes[name].metrics.sourceVolume = sv;
}

// ── state 3: "1 WEEK AGO" — clone of old state 2 + current catalog counts ──
const s3 = JSON.parse(JSON.stringify(old2));
s3.label = "1 WEEK AGO";
s3.period = "2026-08";
for (const p of topic.perspectives as Array<any>) {
  const node = s3.nodes[p.name];
  if (node?.metrics) {
    node.metrics.sourceVolume = p.sources.length; // current catalog count
    if (node.metrics.independentSignals > node.metrics.sourceVolume) {
      node.metrics.independentSignals = node.metrics.sourceVolume;
    }
  }
}
topic.states.push(s3);

// ── per-perspective 4th entries ──
const NEW_BODY: Record<string, string> = {
  Technology: "The past week turned technical: model customization, data fabrics and agent-ready infrastructure lead, as MIT Technology Review joins the source base.",
  Platform: "Choke points and customer competition dominate this week: who owns the defaults, and what happens when AI companies compete with their own customers?",
  Infrastructure: "The data-center boom's local prosperity dividend and grid connectivity are this week's constraint story.",
  Economics: "Falling prices sharpen the question: token economics and commoditization analyses press on where the surplus lands.",
  "Human Impact": "Safety diplomacy, population-scale adoption and the global AI divide widen the human lens this week.",
};
const NEW_HISTORY: Record<string, string> = {
  Technology: "Data infrastructure and customization emerge as the new battlegrounds; capability talk quiets further.",
  Platform: "Choke-point framing takes hold: providers picking winners and customer competition drive the debate.",
  Infrastructure: "Power, siting and edge access are framed as the race's physical constraints.",
  Economics: "Token economics make value capture the CFO-level question.",
  "Human Impact": "Safety diplomacy and the global AI divide broaden the lens beyond jobs.",
};

for (const p of topic.perspectives as Array<any>) {
  const name = p.name;
  // sparkline[i] must mirror each state's node sourceVolume
  p.sparkline = topic.states.map((s: any) => s.nodes[name]?.metrics?.sourceVolume ?? 0);
  p.bodies.push(NEW_BODY[name]);
  p.history.push(NEW_HISTORY[name]);
  // windows gain the 1-month bucket
  if (p.windows && p.windows.m === undefined) p.windows.m = 0;
}

writeFileSync("data/topics/ai-superrace.json", `${JSON.stringify(topic, null, 2)}\n`);
console.log(`reshaped: ${topic.states.length} states [${topic.states.map((s: any) => s.label).join(" | ")}]`);
for (const p of topic.perspectives as Array<any>) {
  console.log(`  ${p.id}: bodies ${p.bodies.length}, sparkline [${p.sparkline.join(",")}], history ${p.history.length}, windows y:${p.windows?.y} q:${p.windows?.q} m:${p.windows?.m ?? "-"} w:${p.windows?.w}`);
}