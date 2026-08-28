/**
 * tests/unit/schema.test.ts
 *
 * Unit tests for all zod schemas — round-trip valid fixture and rejection tests
 * per §8.3 check catalog and §12 layer 1 specification.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Topic, AccessPolicy, TelemetryEvent, Approval } from "../../schema/src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadJSON(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, "..", "fixtures", name), "utf-8"));
}

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

const VALID_TOPIC = loadJSON("fixture-topic.json");

// ── Topic: Valid fixture round-trip ────────────────────────────────────────

describe("Topic schema", () => {
  it("parses the valid fixture", () => {
    const result = Topic.safeParse(VALID_TOPIC);
    if (!result.success) {
      console.error(JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  // ── Rejection cases ──────────────────────────────────────────────────────

  it("rejects x out of range (< 0)", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).states[0].nodes["technology"].position.x = -1;
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects x out of range (> 100)", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).states[0].nodes["technology"].position.x = 101;
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects y out of range (< 0)", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).states[0].nodes["technology"].position.y = -0.1;
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects y out of range (> 100)", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).states[0].nodes["technology"].position.y = 101;
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects w <= 0", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).states[0].nodes["technology"].size.w = 0;
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects w > 100", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).states[0].nodes["technology"].size.w = 101;
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects h <= 0", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).states[0].nodes["technology"].size.h = 0;
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects h > 100", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).states[0].nodes["technology"].size.h = 101;
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects bad border-radius format", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).states[0].nodes["technology"].borderRadius = "10px 20px";
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects border-radius with missing slash", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).states[0].nodes["technology"].borderRadius = "44% 56% 51% 49% 54% 43% 57% 46%";
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects opacity < 0", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).states[0].nodes["technology"].opacity = -0.1;
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects opacity > 1", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).states[0].nodes["technology"].opacity = 1.1;
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects independentSignals > sourceVolume", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).states[0].nodes["technology"].metrics.independentSignals = 20;
    (data as any).states[0].nodes["technology"].metrics.sourceVolume = 10;
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects Invisible with emergence > 0.05", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).states[0].nodes["technology"].metrics.status = "Invisible";
    (data as any).states[0].nodes["technology"].metrics.emergence = 0.1;
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects bodies length != states length", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).perspectives[0].bodies = ["only one body"];
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects sparkline length != states length", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).perspectives[0].sparkline = [0.5];
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects relations referencing unknown perspective", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).relations = [
      { from: "nonexistent", to: "technology", strength: 0.5, reason: "test fail" },
    ];
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects states with differing node keys", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    delete (data as any).states[1].nodes["human-impact"];
    (data as any).states[1].nodes["extra-perspective"] = { ...(data as any).states[1].nodes["technology"] };
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects bad slug format (uppercase)", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).slug = "Bad-Slug";
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects bad slug format (underscores)", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).slug = "bad_slug";
    expect(Topic.safeParse(data).success).toBe(false);
  });

  it("rejects bad date format (not ISO date)", () => {
    const data = clone(VALID_TOPIC) as Record<string, unknown>;
    (data as any).date = "2026/08/01";
    expect(Topic.safeParse(data).success).toBe(false);
  });

  // ── AccessPolicy refines ─────────────────────────────────────────────────

  it("rejects fullText true with reuse link_only", () => {
    const result = AccessPolicy.safeParse({
      access: "open", license: "CC", reuse: "link_only",
      fullText: true, summary: true, link: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects fullText true with reuse none", () => {
    const result = AccessPolicy.safeParse({
      access: "open", license: "CC", reuse: "none",
      fullText: true, summary: true, link: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects license unknown with reuse allowed_with_attribution", () => {
    const result = AccessPolicy.safeParse({
      access: "open", license: "unknown", reuse: "allowed_with_attribution",
      fullText: false, summary: true, link: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects link false", () => {
    const result = AccessPolicy.safeParse({
      access: "open", license: "copyright", reuse: "link_only",
      fullText: false, summary: true, link: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts link_only with copyright", () => {
    const result = AccessPolicy.safeParse({
      access: "open", license: "copyright", reuse: "link_only",
      fullText: false, summary: true, link: true,
    });
    expect(result.success).toBe(true);
  });

  // ── TelemetryEvent ───────────────────────────────────────────────────────

  describe("TelemetryEvent schema", () => {
    it("parses a valid event", () => {
      const result = TelemetryEvent.safeParse({
        ts: "2026-08-28T12:00:00Z",
        run: "run-001",
        event: "run_start",
      });
      expect(result.success).toBe(true);
    });

    it("rejects bad event name", () => {
      const result = TelemetryEvent.safeParse({
        ts: "2026-08-28T12:00:00Z",
        run: "run-001",
        event: "invalid_event",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing ts", () => {
      const result = TelemetryEvent.safeParse({
        run: "run-001",
        event: "run_start",
      });
      expect(result.success).toBe(false);
    });

    it("rejects bad datetime format", () => {
      const result = TelemetryEvent.safeParse({
        ts: "not-a-datetime",
        run: "run-001",
        event: "run_start",
      });
      expect(result.success).toBe(false);
    });
  });

  // ── Approval ─────────────────────────────────────────────────────────────

  describe("Approval schema", () => {
    it("parses a valid approval", () => {
      const result = Approval.safeParse({
        run: "run-001",
        decidedBy: "human-editor",
        decidedAt: "2026-08-28T12:00:00Z",
        decisions: [
          { proposalId: "P-001", decision: "approve" },
          { proposalId: "P-002", decision: "reject", note: "Needs more evidence" },
          { proposalId: "P-003", decision: "edit", editedPayload: { summary: "Updated" } },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("rejects decision not in enum", () => {
      const result = Approval.safeParse({
        run: "run-001", decidedBy: "human-editor",
        decidedAt: "2026-08-28T12:00:00Z",
        decisions: [{ proposalId: "P-001", decision: "invalid_decision" }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects proposalId not matching P-###", () => {
      const result = Approval.safeParse({
        run: "run-001", decidedBy: "human-editor",
        decidedAt: "2026-08-28T12:00:00Z",
        decisions: [{ proposalId: "proposal-1", decision: "approve" }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty decisions array", () => {
      const result = Approval.safeParse({
        run: "run-001", decidedBy: "human-editor",
        decidedAt: "2026-08-28T12:00:00Z",
        decisions: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects proposalId with wrong pattern P-####", () => {
      const result = Approval.safeParse({
        run: "run-001", decidedBy: "human-editor",
        decidedAt: "2026-08-28T12:00:00Z",
        decisions: [{ proposalId: "P-0001", decision: "approve" }],
      });
      expect(result.success).toBe(false);
    });
  });
});