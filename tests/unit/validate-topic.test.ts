/**
 * tests/unit/validate-topic.test.ts
 *
 * Tests for the validateTopic function exported by tools/validate-topic.ts.
 * Exercises the pure check function with fixture data and inline mutations.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { validateTopic } from "../../tools/validate-topic.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadJSON(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, "..", "fixtures", name), "utf-8"));
}

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

const VALID_TOPIC = loadJSON("fixture-topic.json");
const VALID_ARTICLES = loadJSON("fixture-articles.json");
const VALID_REGISTRY = loadJSON("fixture-publishers.json");
const VALID_MANIFEST = loadJSON("fixture-manifest.json");

describe("validateTopic", () => {
  // ── Valid fixture → all pass ──────────────────────────────────────────────

  it("passes all checks for the valid fixture", async () => {
    const report = await validateTopic({
      topic: VALID_TOPIC,
      articles: VALID_ARTICLES as any,
      registry: VALID_REGISTRY as any,
      manifest: VALID_MANIFEST as any,
    });
    expect(report.ok).toBe(true);
    expect(report.checks.every((c) => c.status === "pass")).toBe(true);
    expect(report.checks.length).toBe(4); // schema, source-resolve, licensing, manifest-sync
  });

  // ── Unresolved source ID → fail ──────────────────────────────────────────

  it("fails when a source ID does not resolve in articles cache", async () => {
    const topic = clone(VALID_TOPIC) as any;
    topic.perspectives[0].sources.push("source-999");

    const report = await validateTopic({
      topic,
      articles: VALID_ARTICLES as any,
      registry: VALID_REGISTRY as any,
      manifest: VALID_MANIFEST as any,
    });
    expect(report.ok).toBe(false);
    const srCheck = report.checks.find((c) => c.name === "source-resolve");
    expect(srCheck?.status).toBe("fail");
    expect(srCheck?.details.some((d) => d.includes("source-999"))).toBe(true);
  });

  // ── License mismatch vs registry → fail ──────────────────────────────────

  it("fails when a source license differs from registry default", async () => {
    const articles = clone(VALID_ARTICLES) as any;
    articles.articles[0].accessPolicy.license = "CC-BY";

    const report = await validateTopic({
      topic: VALID_TOPIC,
      articles,
      registry: VALID_REGISTRY as any,
      manifest: VALID_MANIFEST as any,
    });
    expect(report.ok).toBe(false);
    const licCheck = report.checks.find((c) => c.name === "licensing");
    expect(licCheck?.status).toBe("fail");
    expect(licCheck?.details.some((d) => d.includes("mismatch"))).toBe(true);
  });

  // ── fullText true + reuse link_only → fail (hard rule) ───────────────────

  it("fails when source has fullText true with reuse link_only", async () => {
    const articles = clone(VALID_ARTICLES) as any;
    articles.articles[0].accessPolicy.fullText = true;

    const report = await validateTopic({
      topic: VALID_TOPIC,
      articles,
      registry: VALID_REGISTRY as any,
      manifest: VALID_MANIFEST as any,
    });
    expect(report.ok).toBe(false);
    const licCheck = report.checks.find((c) => c.name === "licensing");
    expect(licCheck?.status).toBe("fail");
    expect(licCheck?.details.some((d) => d.includes("fullText"))).toBe(true);
  });

  // ── Manifest missing slug → fail ────────────────────────────────────────

  it("fails when slug is not in manifest", async () => {
    const manifest = clone(VALID_MANIFEST) as any;
    manifest.topics = [{ slug: "other-topic", file: "other-topic.json" }];

    const report = await validateTopic({
      topic: VALID_TOPIC,
      articles: VALID_ARTICLES as any,
      registry: VALID_REGISTRY as any,
      manifest,
    });
    expect(report.ok).toBe(false);
    const msCheck = report.checks.find((c) => c.name === "manifest-sync");
    expect(msCheck?.status).toBe("fail");
    expect(msCheck?.details.some((d) => d.includes("not found in manifest"))).toBe(true);
  });

  // ── --schema-only skips cross-file checks ───────────────────────────────

  it("skips cross-file checks when schemaOnly is true", async () => {
    const report = await validateTopic({
      topic: VALID_TOPIC,
      articles: VALID_ARTICLES as any,
      registry: VALID_REGISTRY as any,
      manifest: VALID_MANIFEST as any,
      schemaOnly: true,
    });
    expect(report.ok).toBe(true);
    for (const check of report.checks) {
      if (check.name !== "schema") {
        expect(check.status).toBe("skipped");
      } else {
        expect(check.status).toBe("pass");
      }
    }
  });

  // ── Missing articles cache → skipped source-resolve + licensing parts ───

  it("skips source-resolve and licensing when articles not provided", async () => {
    const report = await validateTopic({
      topic: VALID_TOPIC,
      registry: VALID_REGISTRY as any,
      manifest: VALID_MANIFEST as any,
    });
    expect(report.ok).toBe(true);
    const srCheck = report.checks.find((c) => c.name === "source-resolve");
    expect(srCheck?.status).toBe("skipped");
    const licCheck = report.checks.find((c) => c.name === "licensing");
    expect(licCheck?.status).toBe("skipped");
    const msCheck = report.checks.find((c) => c.name === "manifest-sync");
    expect(msCheck?.status).toBe("pass");
  });

  // ── Invalid topic schema → schema fails, subsequent checks skip ─────────

  it("schema check fails on invalid topic, subsequent checks skip gracefully", async () => {
    const report = await validateTopic({
      topic: { slug: "invalid", title: "" },
      articles: VALID_ARTICLES as any,
      registry: VALID_REGISTRY as any,
      manifest: VALID_MANIFEST as any,
    });
    expect(report.ok).toBe(false);
    expect(report.checks[0]!.status).toBe("fail");
    expect(report.checks[1]!.status).toBe("skipped");
    expect(report.checks[2]!.status).toBe("skipped");
  });

  // ── Publisher not in registry → details note but not hard fail ──────────

  it("notes when a publisher is not in the registry but does not fail", async () => {
    const articles = clone(VALID_ARTICLES) as any;
    articles.articles[0].publisher = "Unknown Publisher";

    const report = await validateTopic({
      topic: VALID_TOPIC,
      articles,
      registry: VALID_REGISTRY as any,
      manifest: VALID_MANIFEST as any,
    });
    // Should still pass (unregistered publishers get tier-3 treatment per §5.4)
    expect(report.ok).toBe(true);
    const licCheck = report.checks.find((c) => c.name === "licensing");
    expect(licCheck?.details.some((d) => d.includes("not found in registry"))).toBe(true);
  });
});