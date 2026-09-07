/**
 * pipeline/src/quality.ts — editorial quality gate (spec v0.2 §8)
 * Pure functions; no I/O. Invoked by the validate stage after validateTopic.
 * checkDegradedArtifact uses fs to read the artifact (validate-stage helper).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface QualityViolation {
  rule: string;
  perspective?: string;
  value: number;
  threshold: number;
  message: string;
}

export interface QualityGateResult {
  ok: boolean;
  violations: QualityViolation[];
}

interface NodeMetrics {
  confidence?: number;
  independentSignals?: number;
}

const PLACEHOLDER_PATTERN = /^Migrated placeholder/i;

function latestStateNodes(topic: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const states = (topic.states as Array<Record<string, unknown>> | undefined) ?? [];
  const last = states[states.length - 1];
  return ((last?.nodes as Record<string, Record<string, unknown>>) ?? {});
}

export function runQualityGate(
  topic: Record<string, unknown>,
  quality: Record<string, unknown> | undefined,
): QualityGateResult {
  const violations: QualityViolation[] = [];
  if (!quality) return { ok: true, violations };

  const minConfidence = quality.minimumConfidence as number | undefined;
  const minSignals = quality.minimumIndependentSources as number | undefined;
  const maxShare = quality.maximumSinglePerspectiveShare as number | undefined;
  const requireCounter = quality.requireCounterargument as boolean | undefined;

  const nodes = latestStateNodes(topic);

  // Pass 1: per-perspective thresholds.
  for (const [name, nodeVal] of Object.entries(nodes)) {
    const metrics = (nodeVal.metrics ?? {}) as Record<string, unknown>;
    if (minConfidence !== undefined && typeof metrics.confidence === "number" && metrics.confidence < minConfidence) {
      violations.push({ rule: "minimumConfidence", perspective: name, value: metrics.confidence, threshold: minConfidence,
        message: `Perspective "${name}" confidence ${metrics.confidence} < ${minConfidence}` });
    }
    if (minSignals !== undefined && typeof metrics.independentSignals === "number" && metrics.independentSignals < minSignals) {
      violations.push({ rule: "minimumIndependentSources", perspective: name, value: metrics.independentSignals, threshold: minSignals,
        message: `Perspective "${name}" independentSignals ${metrics.independentSignals} < ${minSignals}` });
    }
    if (requireCounter) {
      const counter = nodeVal.counterArgument as string | undefined;
      const args = (nodeVal.arguments as Array<{ momentum?: string }> | undefined) ?? [];
      const hasDownArg = args.some((a) => a.momentum === "down");
      const realCounter = typeof counter === "string" && counter.trim() !== "" && !PLACEHOLDER_PATTERN.test(counter.trim());
      if (!realCounter && !hasDownArg) {
        violations.push({ rule: "requireCounterargument", perspective: name, value: 0, threshold: 1,
          message: `Perspective "${name}" has no real counterargument (placeholder or missing)` });
      }
    }
  }

  // Pass 2: concentration share, basis = independentSignals (spec §8 fix).
  if (maxShare !== undefined) {
    const signals = new Map<string, number>();
    let total = 0;
    for (const [name, nodeVal] of Object.entries(nodes)) {
      const s = (nodeVal.metrics as Record<string, unknown> | undefined)?.independentSignals;
      if (typeof s === "number") { signals.set(name, s); total += s; }
    }
    if (total > 0) {
      for (const [name, s] of signals) {
        const share = s / total;
        if (share > maxShare) {
          violations.push({ rule: "maximumSinglePerspectiveShare", perspective: name, value: share, threshold: maxShare,
            message: `Perspective "${name}" holds ${(share * 100).toFixed(1)}% of independent signals (cap ${maxShare * 100}%)` });
        }
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Check whether a run's proposals.json artifact has the degraded flag.
 * Returns true if the file exists, parseable, and has `"degraded": true`.
 */
export function checkDegradedArtifact(runDir: string): boolean {
  try {
    const p = join(runDir, "analysis", "proposals.json");
    if (!existsSync(p)) return false;
    const parsed = JSON.parse(readFileSync(p, "utf-8"));
    return parsed?.degraded === true;
  } catch { return false; }
}

export type BudgetAction = "ok" | "warn" | "halt" | "fallback";
export function resolveBudgetAction(budget: Record<string, unknown> | undefined, spent: number): BudgetAction {
  const maxCost = (budget?.maxCostPerRun as number) ?? Infinity;
  const action = (budget?.actionOnExceed as string) ?? "halt";
  if (spent >= maxCost) return action === "fallback_to_fast_model" ? "fallback" : "halt";
  if (maxCost !== Infinity && spent >= maxCost * 0.2) return "warn";
  return "ok";
}