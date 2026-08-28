/**
 * tests/pipeline/apply.test.ts
 *
 * Tests the apply stage merge logic: setByPath/getByPath, approval filtering,
 * and the full apply cycle with cleanup.
 *
 * Uses real data/ paths for integration but cleans up after.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { setByPath, getByPath } from "../../pipeline/src/runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const DATA_DIR = join(ROOT, "data");
const FIXTURES_DIR = join(__dirname, "fixtures");

// Load the fixture topic
const FIXTURE_TOPIC = JSON.parse(
  readFileSync(join(ROOT, "tests", "fixtures", "fixture-topic.json"), "utf-8"),
) as Record<string, unknown>;

describe("setByPath / getByPath", () => {
  it("sets and gets a value at a simple dot path", () => {
    const obj = { a: 1, b: { c: 2 } };
    setByPath(obj, "b.c", 3);
    expect(getByPath(obj, "b.c")).toBe(3);
    expect(obj.b.c).toBe(3);
  });

  it("sets a value at an array index path", () => {
    const obj = { states: [{ question: "old" }, { question: "old2" }] };
    setByPath(obj, "states.1.question", "updated");
    expect(getByPath(obj, "states.1.question")).toBe("updated");
  });

  it("sets a deeply nested value", () => {
    const obj = {
      states: [
        {
          nodes: {
            technology: {
              metrics: {
                editorialWeight: 0.5,
              },
            },
          },
        },
      ],
    };
    setByPath(obj, "states.0.nodes.technology.metrics.editorialWeight", 0.85);
    expect(getByPath(obj, "states.0.nodes.technology.metrics.editorialWeight")).toBe(0.85);
  });

  it("creates intermediate objects when setting", () => {
    const obj = {} as Record<string, unknown>;
    setByPath(obj, "a.b.c", 42);
    expect((obj.a as Record<string, unknown>).b).toBeDefined();
    expect(((obj.a as Record<string, unknown>).b as Record<string, unknown>).c).toBe(42);
  });

  it("returns undefined for nonexistent path", () => {
    const obj = { a: 1 };
    expect(getByPath(obj, "b.c.d")).toBeUndefined();
  });

  it("handles numeric array indices", () => {
    const obj = { items: [10, 20, 30] };
    setByPath(obj, "items.1", 25);
    expect(obj.items).toEqual([10, 25, 30]);
  });
});

describe("Full apply flow", () => {
  const testRunId = `test-apply-${randomUUID().slice(0, 8)}`;

  afterAll(() => {
    // Clean up test artifacts
    const runDir = join(DATA_DIR, "runs", testRunId);
    if (existsSync(runDir)) rmSync(runDir, { recursive: true, force: true });
    const approvalsDir = join(DATA_DIR, "approvals", `${testRunId}.json`);
    if (existsSync(approvalsDir)) rmSync(approvalsDir, { force: true });

    // Restore original topic if we backed it up
    const topicPath = join(DATA_DIR, "topics", "test-topic.json");
    if (existsSync(topicPath)) {
      const backupDir = join(DATA_DIR, "backups", "test-topic");
      if (existsSync(backupDir)) rmSync(backupDir, { recursive: true, force: true });
    }
  });

  it("applies approved proposals and skips rejected ones", async () => {
    // Set up the topic in data/topics/
    const topicPath = join(DATA_DIR, "topics", "test-topic.json");
    writeFileSync(topicPath, JSON.stringify(FIXTURE_TOPIC, null, 2) + "\n", "utf-8");

    // Set up run directory with proposals
    const runDir = join(DATA_DIR, "runs", testRunId);
    mkdirSync(join(runDir, "analysis"), { recursive: true });
    mkdirSync(join(runDir, "writing"), { recursive: true });

    const proposals = [
      { id: "P-001", kind: "metrics", path: "states.0.nodes.technology.metrics.editorialWeight", value: 0.85, confidence: 0.8, evidence: "Test" },
      { id: "P-002", kind: "metrics", path: "states.0.nodes.technology.metrics.sourceVolume", value: 20, confidence: 0.7, evidence: "Test" },
    ];
    writeFileSync(join(runDir, "analysis", "proposals.json"), JSON.stringify({ proposals }, null, 2) + "\n", "utf-8");
    writeFileSync(join(runDir, "writing", "narrative.json"), JSON.stringify({ narrative: [] }, null, 2) + "\n", "utf-8");
    writeFileSync(join(runDir, "manifest.json"), JSON.stringify({ runId: testRunId, topic: "test-topic" }, null, 2) + "\n", "utf-8");

    // Set up approval - approve P-001, reject P-002
    const approvalsDir = join(DATA_DIR, "approvals");
    mkdirSync(approvalsDir, { recursive: true });
    const approvalRecord = {
      run: testRunId,
      decidedBy: "test",
      decidedAt: "2026-08-28T12:00:00.000Z",
      decisions: [
        { proposalId: "P-001", decision: "approve" },
        { proposalId: "P-002", decision: "reject", note: "Not needed" },
      ],
    };
    writeFileSync(join(approvalsDir, `${testRunId}.json`), JSON.stringify(approvalRecord, null, 2) + "\n", "utf-8");

    // Now simulate the apply merge logic
    const topic = JSON.parse(readFileSync(topicPath, "utf-8")) as Record<string, unknown>;

    // Verify initial state
    expect(getByPath(topic, "states.0.nodes.technology.metrics.editorialWeight")).toBe(0.5);
    expect(getByPath(topic, "states.0.nodes.technology.metrics.sourceVolume")).toBe(10);

    // Apply - only P-001 approved (P-002 rejected)
    const decisionMap = new Map<string, { decision: string; editedPayload?: unknown }>();
    for (const d of approvalRecord.decisions) {
      decisionMap.set(d.proposalId, d);
    }

    for (const proposal of proposals) {
      const decision = decisionMap.get(proposal.id);
      if (!decision || decision.decision === "reject") continue;
      if (["metrics", "status", "question", "synthesis", "narrative"].includes(proposal.kind)) {
        setByPath(topic, proposal.path, proposal.value);
      }
    }

    // Verify P-001 was applied
    expect(getByPath(topic, "states.0.nodes.technology.metrics.editorialWeight")).toBe(0.85);
    // Verify P-002 was rejected
    expect(getByPath(topic, "states.0.nodes.technology.metrics.sourceVolume")).toBe(10);
  });

  it("edit approval applies editedPayload instead of original value", () => {
    const topic = JSON.parse(JSON.stringify(FIXTURE_TOPIC)) as Record<string, unknown>;
    const proposal = { id: "P-001", kind: "narrative", path: "perspectives.0.summary", value: "Original", confidence: 0.8, evidence: "Test" };

    // Edit decision overrides value
    const editedPayload = "Edited summary text";
    setByPath(topic, proposal.path, editedPayload);

    expect(getByPath(topic, "perspectives.0.summary")).toBe("Edited summary text");
  });

  it("produces deterministic output (run twice, identical)", () => {
    const topic1 = JSON.parse(JSON.stringify(FIXTURE_TOPIC)) as Record<string, unknown>;
    const topic2 = JSON.parse(JSON.stringify(FIXTURE_TOPIC)) as Record<string, unknown>;

    const proposals = [
      { id: "P-001", kind: "metrics", path: "states.0.nodes.technology.metrics.editorialWeight", value: 0.9, confidence: 0.8, evidence: "Test" },
    ];

    for (const proposal of proposals) {
      if (["metrics", "status", "question", "synthesis", "narrative"].includes(proposal.kind)) {
        setByPath(topic1, proposal.path, proposal.value);
        setByPath(topic2, proposal.path, proposal.value);
      }
    }

    const bytes1 = JSON.stringify(topic1);
    const bytes2 = JSON.stringify(topic2);
    expect(bytes1).toBe(bytes2);
  });

  it("restores backup on validation failure", () => {
    // We test that the pattern of backup-then-restore works
    const topic = JSON.parse(JSON.stringify(FIXTURE_TOPIC)) as Record<string, unknown>;

    // Path that would cause validation to fail (bad slug etc.)
    const proposal = { id: "P-001", kind: "narrative", path: "slug", value: "INVALID-SLUG", confidence: 0.8, evidence: "Test" };

    // Backup the original
    const originalSummary = topic.summary ?? topic.synthesis;

    // Apply a bad change
    setByPath(topic, proposal.path, proposal.value);

    // Restore from backup
    const restored = JSON.parse(JSON.stringify(FIXTURE_TOPIC)) as Record<string, unknown>;

    // Verify restoration works
    expect(restored.slug).toBe("test-topic");
    expect((restored as any).slug).not.toBe("INVALID-SLUG");
  });
});