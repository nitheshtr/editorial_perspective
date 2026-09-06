/**
 * tests/pipeline/quality.test.ts
 *
 * Quality gate tests: confidence, independent signals, concentration share,
 * counterargument requirement.
 */

import { describe, it, expect } from "vitest";
import { runQualityGate } from "../../pipeline/src/quality.js";

const node = (confidence: number, signals: number) => ({
  metrics: { confidence, independentSignals: signals },
});

const topic = (nodes: Record<string, unknown>) => ({
  states: [{ nodes }],
});

const QUALITY = {
  minimumConfidence: 0.70,
  minimumIndependentSources: 3,
  maximumSinglePerspectiveShare: 0.45,
  maximumSinglePerspectiveShareBasis: "independentSignals",
  requireEvidenceForPerspective: true,
  requireCounterargument: false,
};

describe("runQualityGate", () => {
  it("passes a healthy topic", () => {
    const t = topic({
      A: node(0.85, 9), B: node(0.8, 7), C: node(0.75, 5),
    });
    expect(runQualityGate(t, QUALITY).ok).toBe(true);
  });

  it("violates minimumConfidence per perspective", () => {
    const t = topic({ A: node(0.42, 9), B: node(0.8, 7) });
    const r = runQualityGate(t, QUALITY);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === "minimumConfidence" && v.perspective === "A")).toBe(true);
  });

  it("violates minimumIndependentSources", () => {
    const t = topic({ A: node(0.86, 2), B: node(0.8, 7) });
    const r = runQualityGate(t, QUALITY);
    expect(r.violations.some((v) => v.rule === "minimumIndependentSources")).toBe(true);
  });

  it("computes single-perspective share from independentSignals, not volume", () => {
    const t = { states: [{ nodes: {
      A: { metrics: { confidence: 0.9, independentSignals: 12, sourceVolume: 26 } },
      B: { metrics: { confidence: 0.9, independentSignals: 1 } },
    }}]};
    const r = runQualityGate(t, QUALITY);
    expect(r.ok).toBe(false);
    const v = r.violations.find((x) => x.rule === "maximumSinglePerspectiveShare");
    expect(v).toBeDefined();
    expect(v!.value).toBeCloseTo(12 / 13);
  });

  it("no share violation when denominator is zero", () => {
    const t = topic({ A: node(0.9, 0), B: node(0.9, 0) });
    const r = runQualityGate(t, QUALITY);
    expect(r.violations.some((v) => v.rule === "maximumSinglePerspectiveShare")).toBe(false);
  });

  it("requireCounterargument=false passes placeholder counterArguments", () => {
    // Multiple perspectives with balanced signals to avoid concentration share masking
    const t = { states: [{ nodes: {
      A: { ...node(0.9, 4), counterArgument: "Migrated placeholder — pending Analysis Agent review." },
      B: node(0.9, 4),
      C: node(0.9, 3),
    } }] };
    expect(runQualityGate(t, { ...QUALITY, requireCounterargument: false }).ok).toBe(true);
  });

  it("requireCounterargument=true fails placeholder but passes real counterArgument or down argument", () => {
    // All perspectives must have real counterArguments or down arguments when gate is on
    const placeholder = { states: [{ nodes: {
      A: { ...node(0.9, 4), counterArgument: "Migrated placeholder — pending Analysis Agent review." },
      B: { ...node(0.9, 4), counterArgument: "Some argue scale concentrates power." },
      C: { ...node(0.9, 3), counterArgument: "Open-source models challenge the thesis." },
    } }] };
    expect(runQualityGate(placeholder, { ...QUALITY, requireCounterargument: true }).ok).toBe(false);

    const real = { states: [{ nodes: {
      A: { ...node(0.9, 4), counterArgument: "Some argue models commoditize and platforms lose pricing power." },
      B: { ...node(0.9, 4), counterArgument: "Regulatory tailwinds could slow deployment." },
      C: { ...node(0.9, 3), counterArgument: "Energy constraints may cap scaling." },
    } }] };
    expect(runQualityGate(real, { ...QUALITY, requireCounterargument: true }).ok).toBe(true);

    const viaDownArg = { states: [{ nodes: {
      A: { ...node(0.9, 4), arguments: [{ id: "arg-x-1", statement: "Scale is fading as a story.", momentum: "down", sources: ["source-001"] }] },
      B: { ...node(0.9, 4), counterArgument: "Regulatory tailwinds could slow deployment." },
      C: { ...node(0.9, 3), counterArgument: "Energy constraints may cap scaling." },
    } }] };
    expect(runQualityGate(viaDownArg, { ...QUALITY, requireCounterargument: true }).ok).toBe(true);
  });

  it("evaluates only the latest state", () => {
    const t = { states: [
      { nodes: { A: node(0.1, 1) } },           // bad old state — ignored
      { nodes: { A: node(0.9, 7), B: node(0.9, 6), C: node(0.9, 5) } },
    ]};
    expect(runQualityGate(t, QUALITY).ok).toBe(true);
  });

  it("missing quality config passes by default", () => {
    expect(runQualityGate(topic({ A: node(0.1, 0) }), undefined).ok).toBe(true);
  });
});