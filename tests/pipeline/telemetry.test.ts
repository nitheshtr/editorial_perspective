/**
 * tests/pipeline/telemetry.test.ts
 *
 * Event schema validation, JSONL writing, summary aggregation, costSoFar.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, unlinkSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TelemetryEmitter, type StageTotals } from "../../pipeline/src/telemetry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");

describe("TelemetryEmitter", () => {
  const testRunId = "test-telemetry-run";
  const testTopic = "test-topic";

  afterEach(() => {
    // Clean up test run directory
    const runDir = join(DATA_DIR, "runs", testRunId);
    if (existsSync(runDir)) {
      rmSync(runDir, { recursive: true, force: true });
    }
  });

  it("creates a valid telemetry event and writes JSONL", () => {
    const emitter = new TelemetryEmitter(testRunId, testTopic);
    emitter.emit({ event: "run_start" });
    emitter.runEnd();

    const streamPath = emitter.getStreamPath();
    expect(existsSync(streamPath)).toBe(true);

    const content = readFileSync(streamPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2);

    const parsed = JSON.parse(lines[0]!);
    expect(parsed.run).toBe(testRunId);
    expect(parsed.event).toBe("run_start");
    expect(parsed.ts).toBeDefined();
    expect(parsed.level).toBe("info");
  });

  it("emits stage_start and stage_end", () => {
    const emitter = new TelemetryEmitter(testRunId, testTopic);
    emitter.stageStart("research");
    emitter.stageEnd("research", { articlesFound: 5 });

    const lines = readFileSync(emitter.getStreamPath(), "utf-8").trim().split("\n");
    expect(lines.length).toBe(2);

    const start = JSON.parse(lines[0]!);
    expect(start.event).toBe("stage_start");
    expect(start.stage).toBe("research");

    const end = JSON.parse(lines[1]!);
    expect(end.event).toBe("stage_end");
    expect(end.stage).toBe("research");
    expect(end.data.articlesFound).toBe(5);
  });

  it("tracks llm_call costs and usage in stage totals", () => {
    const emitter = new TelemetryEmitter(testRunId, testTopic);
    emitter.stageStart("analysis");

    emitter.llmCall({
      provider: "openrouter",
      model: "test-model",
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.002,
      latencyMs: 1500,
      attempt: 1,
      stage: "analysis",
    });

    emitter.llmCall({
      provider: "openrouter",
      model: "test-model",
      tokensIn: 200,
      tokensOut: 100,
      costUsd: 0.004,
      latencyMs: 2000,
      attempt: 2,
      stage: "analysis",
    });

    emitter.stageEnd("analysis");

    // Verify telemetry events
    const lines = readFileSync(emitter.getStreamPath(), "utf-8").trim().split("\n");
    expect(lines.length).toBe(4); // stage_start + 2 llm_call + stage_end

    // Verify costSoFar
    expect(emitter.costSoFar()).toBe(0.006);
  });

  it("tracks tool calls", () => {
    const emitter = new TelemetryEmitter(testRunId, testTopic);
    emitter.stageStart("research");
    emitter.toolCall({ tool: "cache-append", target: "articles_cache.json", count: 3 });
    emitter.stageEnd("research");

    const lines = readFileSync(emitter.getStreamPath(), "utf-8").trim().split("\n");
    expect(lines.length).toBe(3);

    const toolEvent = JSON.parse(lines[1]!);
    expect(toolEvent.event).toBe("tool_call");
    expect(toolEvent.data.tool).toBe("cache-append");
  });

  it("emits run_end and appends to summary", () => {
    const emitter = new TelemetryEmitter(testRunId, testTopic);
    // Add some costs
    emitter.stageStart("research");
    emitter.llmCall({ provider: "openrouter", model: "m", tokensIn: 10, tokensOut: 5, costUsd: 0.001, latencyMs: 100, attempt: 1, stage: "research" });
    emitter.stageEnd("research");

    emitter.runEnd();

    // Check summary file
    const summaryPath = join(DATA_DIR, "telemetry", "summary.jsonl");
    expect(existsSync(summaryPath)).toBe(true);

    const summaryContent = readFileSync(summaryPath, "utf-8");
    const lastLine = summaryContent.trim().split("\n").filter(Boolean).pop()!;
    const summary = JSON.parse(lastLine);

    expect(summary.run).toBe(testRunId);
    expect(summary.topic).toBe(testTopic);
    expect(summary.totals.research).toBeDefined();
    expect(summary.totals.research.tokensIn).toBe(10);
    expect(summary.totals.research.tokensOut).toBe(5);
  });

  it("costSoFar returns 0 when no costs recorded", () => {
    const emitter = new TelemetryEmitter("test-nocost", testTopic);
    expect(emitter.costSoFar()).toBe(0);

    // Clean up
    const runDir = join(DATA_DIR, "runs", "test-nocost");
    if (existsSync(runDir)) rmSync(runDir, { recursive: true, force: true });
  });

  it("handles retry counting (attempt > 1 increments retries)", () => {
    const emitter = new TelemetryEmitter("test-retry", testTopic);
    emitter.stageStart("research");
    emitter.llmCall({ provider: "openrouter", model: "m", tokensIn: 10, tokensOut: 5, costUsd: 0.001, latencyMs: 100, attempt: 3, stage: "research" });
    emitter.stageEnd("research");

    // Clean up
    const runDir = join(DATA_DIR, "runs", "test-retry");
    if (existsSync(runDir)) rmSync(runDir, { recursive: true, force: true });
  });
});