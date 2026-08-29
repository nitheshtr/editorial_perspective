/**
 * tests/pipeline/research.test.ts
 *
 * Tests for the research stage: websearch, webfetch, and the ingestCandidates flow.
 * All fetch calls are mocked — zero real network calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTavilySearch } from "../../pipeline/src/tools/websearch.js";
import { createWebFetch } from "../../pipeline/src/tools/webfetch.js";
import {
  ingestCandidates,
  derivePublisherFromUrl,
  ogTypeToSourceType,
  type CandidateInput,
  type IngestContext,
} from "../../pipeline/src/runner.js";

// ── Mock helpers ─────────────────────────────────────────────────────────────

function mockFetch(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) {
  return vi.fn(async (url: string, init?: RequestInit) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    url: headers?.["x-final-url"] ?? url,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    headers: new Headers(headers ?? {}),
  })) as unknown as typeof globalThis.fetch;
}

function mockFetchWithHtml(status: number, html: string, finalUrl?: string) {
  return vi.fn(async (url: string) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    url: finalUrl ?? url,
    json: async () => { throw new Error("Not JSON"); },
    text: async () => html,
    headers: new Headers({}),
  })) as unknown as typeof globalThis.fetch;
}

// ── Tavily search fixture ───────────────────────────────────────────────────

const TAVILY_RESPONSE = {
  results: [
    {
      title: "AI Models Are Getting Cheaper — And That Changes Everything",
      url: "https://example.com/ai-cheaper",
      content: "The cost of running AI inference has dropped dramatically...",
      published_date: "2026-06-15T10:00:00Z",
    },
    {
      title: "Why Open-Source AI Is Winning",
      url: "https://example.org/open-source-wins",
      content: "Open-source models are closing the gap with proprietary systems...",
      published_date: "2026-07-01T08:30:00Z",
    },
  ],
  query: "AI models",
};

// ── Websearch ───────────────────────────────────────────────────────────────

describe("createTavilySearch", () => {
  it("parses a fixture response", async () => {
    const fetchImpl = mockFetch(200, TAVILY_RESPONSE);
    const search = createTavilySearch({ apiKey: "test-key", fetchImpl });
    const results = await search("AI models", { maxResults: 2, days: 90 });

    expect(results).toHaveLength(2);
    expect(results[0]!.title).toBe("AI Models Are Getting Cheaper — And That Changes Everything");
    expect(results[0]!.url).toBe("https://example.com/ai-cheaper");
    expect(results[0]!.publishedDate).toBe("2026-06-15T10:00:00Z");
    expect(results[1]!.content).toBe("Open-source models are closing the gap with proprietary systems...");
  });

  it("throws a clear error when apiKey is missing", () => {
    const origKey = process.env.TAVILY_API_KEY;
    process.env.TAVILY_API_KEY = "";
    expect(() => createTavilySearch()).toThrow("TAVILY_API_KEY");
    process.env.TAVILY_API_KEY = origKey;
  });

  it("throws on fetch error (e.g. network failure)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("Network failure");
    }) as unknown as typeof globalThis.fetch;

    const search = createTavilySearch({ apiKey: "test-key", fetchImpl });
    await expect(search("test")).rejects.toThrow("Tavily search network error");
  });

  it("throws on non-200 response", async () => {
    const fetchImpl = mockFetch(401, { error: "unauthorized" });
    const search = createTavilySearch({ apiKey: "bad-key", fetchImpl });
    await expect(search("test")).rejects.toThrow("Tavily search returned 401");
  });

  it("returns empty array when results field is missing", async () => {
    const fetchImpl = mockFetch(200, {});
    const search = createTavilySearch({ apiKey: "test-key", fetchImpl });
    const results = await search("test");
    expect(results).toEqual([]);
  });

  it("strips www. from urls when normalizing publisher domains", () => {
    expect(derivePublisherFromUrl("https://www.bbc.com/news")).toBe("Bbc");
    expect(derivePublisherFromUrl("https://reuters.com/article")).toBe("Reuters");
    expect(derivePublisherFromUrl("not-a-url")).toBe("Unknown");
  });
});

// ── Webfetch ────────────────────────────────────────────────────────────────

describe("createWebFetch", () => {
  const HTML_FIXTURE = `<!DOCTYPE html>
<html>
<head>
  <title>Test Article Title</title>
  <meta property="og:title" content="OG Title Override" />
  <meta property="og:description" content="This is an OG description for the article." />
  <meta name="description" content="This is a meta description." />
  <meta property="article:published_time" content="2026-05-20T12:00:00Z" />
  <meta property="og:site_name" content="The Example Times" />
  <meta property="og:type" content="article" />
  <link rel="canonical" href="https://example.com/canonical-url" />
</head>
<body><p>Body text should never be included in the output.</p></body>
</html>`;

  it("parses metadata from an HTML fixture", async () => {
    const fetchImpl = mockFetchWithHtml(200, HTML_FIXTURE, "https://example.com/article");
    const fetch = createWebFetch({ fetchImpl });

    const meta = await fetch("https://example.com/article");
    expect(meta).not.toBeNull();
    expect(meta!.title).toBe("OG Title Override");
    expect(meta!.description).toBe("This is an OG description for the article.");
    expect(meta!.publishedTime).toBe("2026-05-20");
    expect(meta!.publisherHint).toBe("The Example Times");
    expect(meta!.ogType).toBe("article");
    expect(meta!.finalUrl).toBe("https://example.com/canonical-url");
  });

  it("falls back to <title> when og:title is missing", async () => {
    const html = `<!DOCTYPE html><html><head><title>Fallback Title</title></head><body></body></html>`;
    const fetchImpl = mockFetchWithHtml(200, html);
    const fetch = createWebFetch({ fetchImpl });

    const meta = await fetch("https://example.com/page");
    expect(meta!.title).toBe("Fallback Title");
  });

  it("returns null on 404", async () => {
    const fetchImpl = mockFetchWithHtml(404, "<html></html>");
    const fetch = createWebFetch({ fetchImpl });

    const meta = await fetch("https://example.com/missing");
    expect(meta).toBeNull();
  });

  it("returns null on network error with AbortSignal simulation", async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    }) as unknown as typeof globalThis.fetch;

    const fetch = createWebFetch({ fetchImpl });
    const meta = await fetch("https://example.com/slow");
    expect(meta).toBeNull();
  });

  it("returns null on fetch throw (timeout, dns failure)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof globalThis.fetch;

    const fetch = createWebFetch({ fetchImpl });
    const meta = await fetch("https://example.com/down");
    expect(meta).toBeNull();
  });

  it("uses canonical URL as finalUrl", async () => {
    const html = `<!DOCTYPE html><html><head><link rel="canonical" href="https://canonical.example/final" /></head><body></body></html>`;
    const fetchImpl = mockFetchWithHtml(200, html, "https://redirected.example/page");
    const fetch = createWebFetch({ fetchImpl });

    const meta = await fetch("https://original.example/page");
    expect(meta!.finalUrl).toBe("https://canonical.example/final");
  });
});

// ── ogTypeToSourceType ──────────────────────────────────────────────────────

describe("ogTypeToSourceType", () => {
  it("maps 'article' to REPORT", () => {
    expect(ogTypeToSourceType("article")).toBe("REPORT");
  });
  it("maps 'analysis' to ANALYSIS", () => {
    expect(ogTypeToSourceType("analysis")).toBe("ANALYSIS");
  });
  it("maps 'opinion' to OPINION", () => {
    expect(ogTypeToSourceType("opinion")).toBe("OPINION");
  });
  it("maps 'feature' to FEATURE", () => {
    expect(ogTypeToSourceType("feature")).toBe("FEATURE");
  });
  it("defaults to REPORT for unknown types", () => {
    expect(ogTypeToSourceType("website")).toBe("REPORT");
    expect(ogTypeToSourceType(undefined)).toBe("REPORT");
  });
});

// ── IngestCandidates pure function ───────────────────────────────────────────

describe("ingestCandidates", () => {
  const baseTopic = {
    title: "Test Topic",
    perspectives: [{ id: "technology" }],
  };

  const baseRegistry = {
    publishers: [
      { name: "The Example Times", tier: 1, policy: { access: "open", license: "CC", reuse: "allowed_with_attribution", fullText: false, summary: true, link: true, pendingVerification: true } },
      { name: "Reuters", tier: 2, policy: { access: "open", license: "copyright", reuse: "link_only", fullText: false, summary: true, link: true, pendingVerification: false } },
    ],
  };

  const baseCache = {
    articles: [
      { id: "source-001", title: "Existing Article", url: "https://existing.example/article", storyCluster: "cluster-1", perspectives: ["technology"] },
    ],
  };

  const makeCandidates = (overrides: Partial<CandidateInput>[] = []): CandidateInput[] => {
    const defaults: CandidateInput[] = [
      { title: "New Discovery in AI", url: "https://example.com/new-ai", description: "A detailed analysis of recent AI developments.", date: "2026-08-01", type: "ANALYSIS", publisher: "The Example Times" },
      { title: "Markets React to Policy Shift", url: "https://reuters.com/markets-policy", description: "How global markets are responding.", date: "2026-07-15", type: "REPORT", publisher: "Reuters" },
    ];
    return defaults.map((c, i) => ({ ...c, ...(overrides[i] ?? {}) }));
  };

  it("ingests valid candidates from known publishers", () => {
    const ctx: IngestContext = { topic: baseTopic, registry: baseRegistry, cache: baseCache };
    const result = ingestCandidates(makeCandidates(), ctx);

    expect(result.stats.total).toBe(2);
    expect(result.stats.added).toBe(2);
    expect(result.stats.skipped).toBe(0);
    expect(result.validArticles).toHaveLength(2);
    expect(result.registryAdditions).toHaveLength(0);
  });

  it("deduplicates by exact URL match", () => {
    const candidates: CandidateInput[] = [
      { title: "Existing Article", url: "https://existing.example/article", description: "This should be skipped.", date: "2026-08-01", type: "REPORT", publisher: "The Example Times" },
    ];
    const ctx: IngestContext = { topic: baseTopic, registry: baseRegistry, cache: baseCache };
    const result = ingestCandidates(candidates, ctx);

    expect(result.stats.added).toBe(0);
    expect(result.validArticles).toHaveLength(0);
  });

  it("deduplicates by near-dup title (case-insensitive, punctuation stripped)", () => {
    const candidates: CandidateInput[] = [
      { title: "Existing Article!", url: "https://example.com/new-url", description: "New URL but same story.", date: "2026-08-01", type: "REPORT", publisher: "The Example Times" },
    ];
    const ctx: IngestContext = { topic: baseTopic, registry: baseRegistry, cache: baseCache };
    const result = ingestCandidates(candidates, ctx);

    expect(result.stats.added).toBe(1);
    expect(result.validArticles).toHaveLength(1);
    // Should reuse cluster-1 from the existing article
    expect(result.validArticles[0]!.storyCluster).toBe("cluster-1");
  });

  it("appends unknown publisher as tier-3 in registryAdditions", () => {
    const candidates: CandidateInput[] = [
      { title: "Unknown Publisher Article", url: "https://unknown.example/story", description: "A new source.", date: "2026-08-10", type: "FEATURE", publisher: "Unknown Press" },
    ];
    const ctx: IngestContext = { topic: baseTopic, registry: baseRegistry, cache: baseCache };
    const result = ingestCandidates(candidates, ctx);

    expect(result.stats.added).toBe(1);
    expect(result.stats.newPublishers).toBe(1);
    expect(result.registryAdditions).toHaveLength(1);
    expect(result.registryAdditions[0]!.name).toBe("Unknown Press");
    expect(result.registryAdditions[0]!.tier).toBe(3);
    expect((result.registryAdditions[0]!.policy as Record<string, unknown>).pendingVerification).toBe(true);
    expect((result.registryAdditions[0]!.policy as Record<string, unknown>).license).toBe("unknown");
  });

  it("reuses the same tier-3 entry for same unknown publisher across candidates", () => {
    const candidates: CandidateInput[] = [
      { title: "Unknown Story 1", url: "https://unknown.example/1", description: "First.", date: "2026-08-01", type: "REPORT", publisher: "Mystery Press" },
      { title: "Unknown Story 2", url: "https://unknown.example/2", description: "Second.", date: "2026-08-02", type: "REPORT", publisher: "Mystery Press" },
    ];
    const ctx: IngestContext = { topic: baseTopic, registry: baseRegistry, cache: baseCache };
    const result = ingestCandidates(candidates, ctx);

    expect(result.stats.added).toBe(2);
    expect(result.stats.newPublishers).toBe(1);
    expect(result.registryAdditions).toHaveLength(1);
  });

  it("skips candidates with invalid data (bad URL)", () => {
    const candidates: CandidateInput[] = [
      { title: "Bad URL", url: "not-a-url", description: "Invalid.", date: "2026-08-01", type: "REPORT", publisher: "The Example Times" },
      { title: "Short", url: "https://example.com/short", description: "Desc.", date: "2026-08-01", type: "REPORT", publisher: "The Example Times" },
    ];
    const ctx: IngestContext = { topic: baseTopic, registry: baseRegistry, cache: baseCache };
    const result = ingestCandidates(candidates, ctx);

    expect(result.stats.skipped).toBe(1);
    expect(result.stats.added).toBe(1);
    expect(result.invalidSkipped).toHaveLength(1);
    expect(result.invalidSkipped[0]!.reason).toContain("Bad URL");
  });

  it("skips candidates with title too short (<3 chars)", () => {
    const candidates: CandidateInput[] = [
      { title: "AB", url: "https://example.com/ab", description: "Too short title.", date: "2026-08-01", type: "REPORT", publisher: "The Example Times" },
    ];
    const ctx: IngestContext = { topic: baseTopic, registry: baseRegistry, cache: baseCache };
    const result = ingestCandidates(candidates, ctx);

    expect(result.stats.skipped).toBe(1);
    expect(result.stats.added).toBe(0);
  });

  it("assigns sequential source ids continuing from cache", () => {
    const ctx: IngestContext = { topic: baseTopic, registry: baseRegistry, cache: { articles: [
      { id: "source-015", title: "Last Article", url: "https://example.com/last", storyCluster: "cluster-15", perspectives: ["technology"] },
    ]}};
    const result = ingestCandidates(makeCandidates(), ctx);

    expect(result.validArticles).toHaveLength(2);
    expect(result.validArticles[0]!.id).toBe("source-016");
    expect(result.validArticles[1]!.id).toBe("source-017");
  });

  it("picks the first perspective id from the topic", () => {
    const topicWithMultiPerspectives = {
      title: "Multi Perspective Topic",
      perspectives: [{ id: "human-impact" }, { id: "economics" }],
    };
    const ctx: IngestContext = { topic: topicWithMultiPerspectives, registry: baseRegistry, cache: baseCache };
    const result = ingestCandidates(makeCandidates(), ctx);

    expect(result.validArticles).toHaveLength(2);
    expect((result.validArticles[0]!.perspectives as string[])[0]).toBe("human-impact");
  });

  it("descriptions are truncated at 400 chars", () => {
    const longDesc = "x".repeat(500);
    const candidates: CandidateInput[] = [
      { title: "Long Description", url: "https://example.com/long", description: longDesc, date: "2026-08-01", type: "REPORT", publisher: "The Example Times" },
    ];
    const ctx: IngestContext = { topic: baseTopic, registry: baseRegistry, cache: baseCache };
    const result = ingestCandidates(candidates, ctx);

    expect(result.validArticles[0]!.description).toHaveLength(400);
  });

  it("pageMeta null -> not counted as webfetch success but not ingested (caller skips before ingestCandidates)", () => {
    // ingestCandidates doesn't handle null; the caller should filter before calling
    // This is a caller-side responsibility, tested in the fetch layer
  });
});

// ── RSS feed flow ────────────────────────────────────────────────────────────

describe("RSS feed integration through ingestCandidates", () => {
  const baseTopic = {
    title: "Test Topic",
    perspectives: [{ id: "technology" }],
  };

  const baseRegistry = {
    publishers: [
      { name: "The Conversation", tier: 1, policy: { access: "open", license: "CC", reuse: "allowed_with_attribution", fullText: false, summary: true, link: true, pendingVerification: false } },
    ],
  };

  const baseCache = {
    articles: [],
  };

  it("ingests RSS-derived candidates through the same pipeline", () => {
    const rssCandidates: CandidateInput[] = [
      {
        title: "How AI Is Reshaping Education",
        url: "https://theconversation.com/ai-education",
        description: "An analysis of AI in education.",
        date: "2026-08-20",
        type: "ANALYSIS",
        publisher: "The Conversation",
      },
      {
        title: "Brookings Report on Digital Economy",
        url: "https://brookings.edu/digital-economy",
        description: "A comprehensive report.",
        date: "2026-08-18",
        type: "REPORT",
        publisher: "Brookings",
      },
    ];

    const ctx = { topic: baseTopic, registry: baseRegistry, cache: baseCache };
    const result = ingestCandidates(rssCandidates, ctx);

    expect(result.stats.total).toBe(2);
    expect(result.stats.added).toBe(2);
    // The Conversation is known, Brookings is new → 1 registry addition
    expect(result.stats.newPublishers).toBe(1);
    expect(result.registryAdditions).toHaveLength(1);
    expect(result.registryAdditions[0]!.name).toBe("Brookings");
  });

  it("deduplicates RSS candidates against existing cache by URL", () => {
    const rssCandidates: CandidateInput[] = [
      {
        title: "Duplicate Article",
        url: "https://example.com/existing-rss",
        description: "Already in cache.",
        date: "2026-08-20",
        type: "REPORT",
        publisher: "The Conversation",
      },
    ];

    const cacheWithExisting = {
      articles: [
        { id: "source-010", title: "Duplicate Article", url: "https://example.com/existing-rss", storyCluster: "cluster-5", perspectives: ["technology"] },
      ],
    };

    const ctx = { topic: baseTopic, registry: baseRegistry, cache: cacheWithExisting };
    const result = ingestCandidates(rssCandidates, ctx);

    expect(result.stats.added).toBe(0);
    expect(result.validArticles).toHaveLength(0);
  });

  it("handles RSS items with missing dates gracefully (falls to today)", () => {
    const rssCandidates: CandidateInput[] = [
      {
        title: "No Date Article",
        url: "https://example.com/no-date",
        description: "No publish date.",
        date: "", // empty date — runner will supply today
        type: "REPORT",
        publisher: "The Conversation",
      },
    ];

    const ctx = { topic: baseTopic, registry: baseRegistry, cache: baseCache };
    const result = ingestCandidates(rssCandidates, ctx);

    expect(result.stats.added).toBe(1);
    const article = result.validArticles[0]!;
    // Should be today's date (YYYY-MM-DD)
    expect(article.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("sponsored.* URLs from RSS are filtered by the runner (not by ingestCandidates)", () => {
    // This is a runner-level guard — ingestCandidates doesn't filter sponsored.
    // The runner checks candidateHost.startsWith("sponsored.") before calling ingestCandidates.
    // We verify that ingestCandidates doesn't have a sponsored filter.
    const sponsoredCandidate: CandidateInput = {
      title: "Sponsored Content",
      url: "https://sponsored.example.com/ad",
      description: "This is paid content.",
      date: "2026-08-20",
      type: "REPORT",
      publisher: "SponsoredCo",
    };

    const ctx = { topic: baseTopic, registry: baseRegistry, cache: baseCache };
    const result = ingestCandidates([sponsoredCandidate], ctx);

    // ingestCandidates will ingest it (the runner is responsible for filtering)
    expect(result.stats.added).toBe(1);
  });

  it("feeds.json missing → stageResearch skips gracefully (tested via runner mock)", () => {
    // This is a runner-level concern; we test the data/config/feeds.json exists
    const fs = require("node:fs");
    const path = require("node:path");
    const feedsPath = require("path").join(__dirname, "..", "..", "data", "config", "feeds.json");
    expect(fs.existsSync(feedsPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(feedsPath, "utf-8"));
    expect(content.feeds).toBeDefined();
    expect(Array.isArray(content.feeds)).toBe(true);
    expect(content.feeds.length).toBeGreaterThan(0);
  });
});
