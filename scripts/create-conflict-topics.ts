/**
 * create-conflict-topics — operator-directed topic expansion (2026-08-28):
 * iran-conflict (last 1 year) + russia-ukraine (last 2 years).
 * Skeletons: 4-state timelines, 5 perspectives with distinct colors, draft
 * flag in the manifest (research pulls fill the source lists; editorial
 * cycles replace placeholder narrative).
 */
import { readFileSync, writeFileSync } from "node:fs";

const TODAY = "2026-08-28";
const registry = readFileSync("data/config/publishers.json", "utf8"); // touch to fail fast if missing

// ── lane colors (consistent with the map's 5 tints) ──
const C = { mil: "#b45b00", dip: "#0071e3", econ: "#27804f", hum: "#6c56b8", geo: "#6e6e73" };

function node(name: string) {
  return {
    position: { x: 0, y: 0 },
    size: { w: 20, h: 16 },
    borderRadius: "44% 56% 51% 49% / 54% 43% 57% 46%",
    opacity: 1,
    metrics: {
      editorialWeight: 0, sourceVolume: 0, independentSignals: 0,
      momentum: 0, emergence: 0, confidence: 0.3, status: "Emerging",
    },
  };
}

function state(label: string, period: string, names: string[], positions: Array<[number, number]>) {
  const nodes: Record<string, any> = {};
  names.forEach((n, i) => {
    const nd = node(n);
    nd.position = { x: positions[i][0], y: positions[i][1] };
    nodes[n] = nd;
  });
  return {
    period, label,
    question: "Skeleton state — pending the first editorial cycle.",
    synthesis: "Draft topic: the source base is being assembled; the first analysis cycle will populate this period's synthesis.",
    lineStrength: 0.5, nodes,
  };
}

function buildPerspectives(specs: Array<{ id: string; name: string; category: string; color: string; lines: string[] }>, stateLabels: string[]) {
  return specs.map((s) => ({
    id: s.id, name: s.name, category: s.category, color: s.color,
    summary: s.lines[3],
    coreArgument: `${s.name}: the defining argument of this conflict lane — pending the first analysis cycle.`,
    counterArgument: "Counterargument pending the first analysis cycle.",
    bodies: [...s.lines],
    sparkline: [0, 0, 0, 0],
    history: [...s.lines],
    sources: [],
  }));
}

const POS: Array<[number, number]> = [[6, 10], [30, 4], [52, 8], [72, 50], [20, 55]];

// ═══ Iran conflict (last 1 year) ═══
const iranSpecs = [
  { id: "military-security", name: "Military & Security", category: "infra", color: C.mil,
    lines: [
      "Deterrence calculus and air-defense gaps frame the security discussion.",
      "Strike exchanges put escalation management at the center of coverage.",
      "Attrition of air defenses and precision-strike reach dominate the frame.",
      "The security lens now asks what deterrence means after direct exchanges.",
    ] },
  { id: "diplomacy-nuclear", name: "Diplomacy & Nuclear File", category: "tech", color: C.dip,
    lines: [
      "The nuclear file and sanctions diplomacy anchor the diplomatic debate.",
      "Negotiation tracks stall while enrichment questions sharpen.",
      "Intermediary diplomacy carries the file as formal talks stay frozen.",
      "The diplomatic question: what framework survives the current escalation?",
    ] },
  { id: "sanctions-economy", name: "Sanctions & Economy", category: "econ", color: C.econ,
    lines: [
      "Sanctions, oil exports and the rial frame the economic conversation.",
      "Enforcement tightening meets workaround trade networks.",
      "Energy prices and subsidy strain move to the center of the lens.",
      "The economic question: how long can the workaround economy absorb pressure?",
    ] },
  { id: "society-human-cost", name: "Society & Human Cost", category: "human", color: C.hum,
    lines: [
      "Daily life, internet restrictions and displacement stay largely off-frame.",
      "Civilian impact enters the margins of the coverage.",
      "Human cost claims a larger share of the editorial space.",
      "The human lens: who bears the cost of escalation and isolation?",
    ] },
  { id: "regional-dynamics", name: "Regional Dynamics", category: "platform", color: C.geo,
    lines: [
      "Proxies, Gulf postures and great-power positioning frame the region.",
      "The regional map redraws as alignments shift under escalation.",
      "Spillover risk and alignment changes become recurring themes.",
      "The regional question: which alignments hold through the conflict?",
    ] },
];

// ═══ Russia–Ukraine (last 2 years) ═══
const ruSpecs = [
  { id: "battlefield-attrition", name: "Battlefield & Attrition", category: "infra", color: C.mil,
    lines: [
      "Attrition warfare, drones and fortified lines frame the battlefield debate.",
      "Drone saturation and defensive depth redefine the front's arithmetic.",
      "Attrition rates and mobilization pressure dominate the frame.",
      "The battlefield question: what breaks first — lines, manpower or money?",
    ] },
  { id: "diplomacy-peace", name: "Diplomacy & Peace Talks", category: "tech", color: C.dip,
    lines: [
      "Peace-track speculation and ceasefire conditions anchor the diplomatic debate.",
      "Negotiation formats multiply while terms stay far apart.",
      "Mediation efforts and security-guarantee drafts move to center frame.",
      "The diplomatic question: which guarantees make a ceasefire hold?",
    ] },
  { id: "humanitarian-cost", name: "Humanitarian Cost", category: "human", color: C.hum,
    lines: [
      "Displacement, strikes on cities and reconstruction costs frame the lens.",
      "Energy-infrastructure strikes deepen the humanitarian story.",
      "Civilian impact and reconstruction claims expand in coverage.",
      "The humanitarian question: what does reconstruction cost, and who pays?",
    ] },
  { id: "sanctions-war-economy", name: "Sanctions & War Economy", category: "econ", color: C.econ,
    lines: [
      "Sanctions, oil price caps and war spending frame the economic debate.",
      "Shadow-fleet workarounds meet tightening enforcement.",
      "Defense-industrial output and sanctions evasion dominate the lens.",
      "The economic question: whose war economy outlasts the other?",
    ] },
  { id: "global-reordering", name: "Global Reordering", category: "platform", color: C.geo,
    lines: [
      "Alliances, Global-South alignment and deterrence credibility frame the lens.",
      "Security realignments accelerate as commitments are tested.",
      "Burden-sharing and credibility arguments become recurring themes.",
      "The global question: what order emerges from the realignment?",
    ] },
];

function buildTopic(slug: string, title: string, subtitle: string, specs: any[], labels: string[], periods: string[]) {
  const states = labels.map((l, i) => state(l, periods[i], specs.map((s) => s.name), POS));
  const perspectives = buildPerspectives(specs, labels);
  return {
    slug, title, subtitle,
    kicker: "CONFLICTS",
    date: TODAY,
    nav: ["AI", "Conflicts", "Global Economy"],
    activeNav: slug,
    states, perspectives,
    relations: [],
  };
}

const iran = buildTopic(
  "iran-conflict",
  "The Iran conflict is redrawing deterrence lines across the region.",
  "One year of coverage: strike exchanges, the nuclear file, sanctions pressure and the human cost of escalation.",
  iranSpecs,
  ["1 YEAR AGO", "3 MONTHS AGO", "1 MONTH AGO", "1 WEEK AGO"],
  ["2025-08", "2025-11", "2026-07", "2026-08"],
);

const ru = buildTopic(
  "russia-ukraine",
  "The Russia–Ukraine war: attrition, negotiation and a reordered world.",
  "Two years of coverage: battlefield attrition, peace diplomacy, humanitarian cost and the global realignment.",
  ruSpecs,
  ["2 YEARS AGO", "1 YEAR AGO", "3 MONTHS AGO", "1 WEEK AGO"],
  ["2024-08", "2025-08", "2026-05", "2026-08"],
);

// ═─ write topic files + manifest ─═
writeFileSync("data/topics/iran-conflict.json", `${JSON.stringify(iran, null, 2)}\n`);
writeFileSync("data/topics/russia-ukraine.json", `${JSON.stringify(ru, null, 2)}\n`);

const manifest = JSON.parse(readFileSync("data/topics/index.json", "utf8"));
for (const t of [iran, ru]) {
  if (!manifest.topics.some((x: any) => x.slug === t.slug)) {
    manifest.topics.push({ slug: t.slug, title: t.title, file: `${t.slug}.json`, added: TODAY, draft: true, section: "conflicts" });
  }
}
writeFileSync("data/topics/index.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`created: iran-conflict + russia-ukraine (draft) | manifest topics: ${manifest.topics.length} | active: ${manifest.active}`);
console.log(`registry check: ${registry.length} chars`);