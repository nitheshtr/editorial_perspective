/**
 * tests/pipeline/guards.test.ts
 *
 * Path allowlist enforcement: inside/outside scope, nested path handling,
 * append-only violation detection.
 */

import { describe, it, expect } from "vitest";
import { isPathInsideScope, parseWriteScopes, assertAppendOnly, GuardError } from "../../pipeline/src/guards.js";

describe("isPathInsideScope", () => {
  it("matches exact file path", () => {
    expect(isPathInsideScope("data/articles/articles_cache.json", [
      "data/articles/articles_cache.json",
    ])).toBe(true);
  });

  it("rejects path outside scope", () => {
    expect(isPathInsideScope("data/topics/test.json", [
      "data/articles/articles_cache.json",
    ])).toBe(false);
  });

  it("matches path under directory scope", () => {
    expect(isPathInsideScope("data/topics/ai-superrace.json", [
      "data/topics/",
    ])).toBe(true);
  });

  it("matches path inside nested directory scope (no trailing slash)", () => {
    expect(isPathInsideScope("data/topics/ai-superrace.json", [
      "data/topics",
    ])).toBe(true);
  });

  it("rejects path outside all scopes", () => {
    expect(isPathInsideScope("config/pipeline.json", [
      "data/topics/",
      "data/backups/",
    ])).toBe(false);
  });

  it("handles multiple scopes", () => {
    expect(isPathInsideScope("data/backups/test/123.json", [
      "data/topics/",
      "data/backups/",
    ])).toBe(true);
  });

  it("rejects path above scope directory", () => {
    expect(isPathInsideScope("../secret.json", [
      "data/topics/",
    ])).toBe(false);
  });

  it("handles empty scopes array", () => {
    expect(isPathInsideScope("data/topics/test.json", [])).toBe(false);
  });
});

describe("parseWriteScopes", () => {
  it("parses inline array", () => {
    const fm = "writeScope:\n  - data/topics/\n  - data/backups/";
    const scopes = parseWriteScopes(fm);
    expect(scopes).toEqual(["data/topics/", "data/backups/"]);
  });

  it("parses empty writeScope", () => {
    const fm = "writeScope: []";
    expect(parseWriteScopes(fm)).toEqual([]);
  });

  it("parses inline array writeScope: [a, b]", () => {
    const fm = "writeScope: [data/topics/, data/backups/]";
    expect(parseWriteScopes(fm)).toEqual(["data/topics/", "data/backups/"]);
  });

  it("handles comments after scope items", () => {
    const fm = "writeScope:\n  - data/topics/  # topic files\n  - data/backups/";
    const scopes = parseWriteScopes(fm);
    expect(scopes).toEqual(["data/topics/", "data/backups/"]);
  });
});

describe("assertAppendOnly", () => {
  const prev = {
    articles: [
      { id: "source-001" },
      { id: "source-002" },
    ],
  };

  it("passes when articles are only added", () => {
    const curr = {
      articles: [
        { id: "source-001" },
        { id: "source-002" },
        { id: "source-003" },
      ],
    };
    expect(() => assertAppendOnly(prev, curr)).not.toThrow();
  });

  it("passes with identical articles", () => {
    const curr = {
      articles: [
        { id: "source-001" },
        { id: "source-002" },
      ],
    };
    expect(() => assertAppendOnly(prev, curr)).not.toThrow();
  });

  it("throws on article removal", () => {
    const curr = {
      articles: [
        { id: "source-001" },
      ],
    };
    expect(() => assertAppendOnly(prev, curr)).toThrow(GuardError);
  });

  it("throws on article modification (id change)", () => {
    const curr = {
      articles: [
        { id: "source-001" },
        { id: "source-003" },
      ],
    };
    expect(() => assertAppendOnly(prev, curr)).toThrow(GuardError);
  });

  it("throws on empty array when prior had entries", () => {
    const curr = { articles: [] };
    expect(() => assertAppendOnly(prev, curr)).toThrow(GuardError);
  });
});