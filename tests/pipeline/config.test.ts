/**
 * tests/pipeline/config.test.ts
 *
 * Validates pipeline config has the §11 v0.2 shape.
 * Reads the live config/pipeline.json file.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("config/pipeline.json", "utf-8"));

describe("pipeline config (§11 shape)", () => {
  it("uses nested stage model keys", () => {
    expect(config.models.analysis).toBeDefined();
    expect(config.models.analysis.provider).toBe("openrouter");
    expect(config.models["models.analysis"]).toBeUndefined();
  });
  it("uses new budget keys with halt default and degraded flag", () => {
    expect(config.budget.maxCostPerRun).toBe(0.10);
    expect(config.budget.actionOnExceed).toBe("halt");
    expect(config.budget.flagDegradedAnalysis).toBe(true);
    expect(config.budget.maxCostUsdPerRun).toBeUndefined();
  });
  it("uses concurrency.maxParallel", () => {
    expect(config.concurrency.maxParallel).toBe(4);
    expect(config.concurrency.maxParallelFetches).toBeUndefined();
  });
  it("has quality, sources, cache, publication blocks", () => {
    expect(config.quality.minimumConfidence).toBe(0.70);
    expect(config.quality.minimumIndependentSources).toBe(3);
    expect(config.quality.maximumSinglePerspectiveShare).toBe(0.45);
    expect(config.quality.maximumSinglePerspectiveShareBasis).toBe("independentSignals");
    expect(config.quality.requireEvidenceForPerspective).toBe(true);
    expect(config.quality.requireCounterargument).toBe(false);
    expect(config.sources.search.provider).toBe("tavily");
    expect(config.sources.rss.registry).toBe("config/sources.json");
    expect(config.cache.enabled).toBe(true);
    expect(config.publication.requireHumanApproval).toBe(true);
    expect(config.publication.autoPublish).toBe(false);
  });
  it("retains failover keyed by actual model name and runtime extensions", () => {
    expect(config.failover[config.models.analysis.model]).toBeDefined();
    expect(config.defaults.maxTokens).toBeDefined();
    expect(config.defaults.timeoutMs).toBeDefined();
    expect(config.telemetry.sink).toBe("jsonl");
  });
});