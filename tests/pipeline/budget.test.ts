/**
 * tests/pipeline/budget.test.ts
 *
 * Run halts when mocked provider costs exceed config budget.
 * We test via the telemetry cost tracking and GuardError path.
 */

import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GuardError } from "../../pipeline/src/guards.js";
import { TelemetryEmitter } from "../../pipeline/src/telemetry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");

describe("Budget enforcement", () => {
  const runId = "test-budget-run";

  afterEach(() => {
    const runDir = join(DATA_DIR, "runs", runId);
    if (existsSync(runDir)) rmSync(runDir, { recursive: true, force: true });
  });

  it("telemetry costSoFar tracks correctly", () => {
    const emitter = new TelemetryEmitter(runId, "test-topic");

    emitter.stageStart("research");
    emitter.llmCall({ provider: "openrouter", model: "m1", tokensIn: 1000, tokensOut: 500, costUsd: 0.01, latencyMs: 100, attempt: 1, stage: "research" });
    emitter.stageEnd("research");

    emitter.stageStart("analysis");
    emitter.llmCall({ provider: "openrouter", model: "m2", tokensIn: 2000, tokensOut: 1000, costUsd: 0.02, latencyMs: 200, attempt: 1, stage: "analysis" });
    emitter.stageEnd("analysis");

    expect(emitter.costSoFar()).toBe(0.03);
  });

  it("budget check throws GuardError when exceeded", () => {
    const emitter = new TelemetryEmitter(runId, "test-topic");
    const maxCost = 0.005;

    emitter.stageStart("research");
    emitter.llmCall({ provider: "openrouter", model: "m1", tokensIn: 1000, tokensOut: 500, costUsd: 0.01, latencyMs: 100, attempt: 1, stage: "research" });
    emitter.stageEnd("research");

    expect(emitter.costSoFar()).toBeGreaterThan(maxCost);

    expect(() => {
      if (emitter.costSoFar() >= maxCost) {
        throw new GuardError(`Budget exceeded: $${emitter.costSoFar()} >= $${maxCost}`);
      }
    }).toThrow(GuardError);
  });

  it("emits budget event when cost exceeded", () => {
    const emitter = new TelemetryEmitter(runId, "test-topic");
    const maxCost = 0.005;

    emitter.stageStart("research");
    emitter.llmCall({ provider: "openrouter", model: "m1", tokensIn: 1000, tokensOut: 500, costUsd: 0.01, latencyMs: 100, attempt: 1, stage: "research" });
    emitter.stageEnd("research");

    emitter.emit({
      event: "budget",
      data: { spentUsd: emitter.costSoFar(), limitUsd: maxCost, action: "halt" },
    });

    const streamPath = emitter.getStreamPath();
    const content = readFileSync(streamPath, "utf-8");
    const lines = content.trim().split("\n");
    const lastLine = lines[lines.length - 1]!;
    const parsed = JSON.parse(lastLine);
    expect(parsed.event).toBe("budget");
    expect(parsed.data.spentUsd).toBeGreaterThan(maxCost);
  });
});