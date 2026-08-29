/**
 * tests/pipeline/webfetch.test.ts
 *
 * Tests for the enhanced webfetch metadata extraction:
 * - JSON-LD datePublished/dateModified extraction
 * - JSON-LD publisher.name and headline fallbacks
 * - Priority chain: JSON-LD > article:published_time > meta[name="date"] > <time datetime>
 * - YYYY-MM-DD normalization
 * - extractDateFromJsonLd pure helper
 */

import { describe, it, expect, vi } from "vitest";
import { createWebFetch, extractDateFromJsonLd, type PageMeta } from "../../pipeline/src/tools/webfetch.js";

// ── Mock helpers ─────────────────────────────────────────────────────────────

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

// ── extractDateFromJsonLd (pure helper) ─────────────────────────────────────

describe("extractDateFromJsonLd", () => {
  it("extracts datePublished from a standalone JSON-LD object", () => {
    const result = extractDateFromJsonLd({
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      datePublished: "2026-08-15T10:00:00Z",
      headline: "Test Article",
    });
    expect(result).toBe("2026-08-15");
  });

  it("falls back to dateModified when datePublished is absent", () => {
    const result = extractDateFromJsonLd({
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      dateModified: "2026-07-20T08:30:00Z",
    });
    expect(result).toBe("2026-07-20");
  });

  it("prefers datePublished over dateModified", () => {
    const result = extractDateFromJsonLd({
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      datePublished: "2026-06-01T00:00:00Z",
      dateModified: "2026-06-15T00:00:00Z",
    });
    expect(result).toBe("2026-06-01");
  });

  it("walks @graph wrapper and picks the first date", () => {
    const result = extractDateFromJsonLd({
      "@graph": [
        { "@type": "WebPage", datePublished: "2026-05-10T00:00:00Z" },
        { "@type": "NewsArticle", datePublished: "2026-05-15T00:00:00Z" },
      ],
    });
    expect(result).toBe("2026-05-10");
  });

  it("walks arrays of JSON-LD objects", () => {
    const result = extractDateFromJsonLd([
      { "@type": "NewsArticle", datePublished: "2026-04-01T00:00:00Z" },
    ]);
    expect(result).toBe("2026-04-01");
  });

  it("returns empty string for non-object input", () => {
    expect(extractDateFromJsonLd(null)).toBe("");
    expect(extractDateFromJsonLd(undefined)).toBe("");
    expect(extractDateFromJsonLd("string")).toBe("");
    expect(extractDateFromJsonLd(42)).toBe("");
  });

  it("returns empty string when no date fields are present", () => {
    expect(extractDateFromJsonLd({ "@type": "Thing", name: "Foo" })).toBe("");
  });

  it("returns empty string when date is not parseable", () => {
    expect(extractDateFromJsonLd({ datePublished: "not-a-date" })).toBe("");
  });
});

// ── createWebFetch with JSON-LD ─────────────────────────────────────────────

describe("createWebFetch — JSON-LD priority", () => {
  const JSON_LD_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>HTML Title</title>
  <meta property="og:title" content="OG Title" />
  <meta property="og:description" content="OG description" />
  <meta name="description" content="Meta description" />
  <meta property="article:published_time" content="2026-05-20T12:00:00Z" />
  <meta property="og:site_name" content="OG Site Name" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": "JSON-LD Headline",
    "datePublished": "2026-08-15T10:00:00Z",
    "publisher": { "name": "JSON-LD Publisher" }
  }
  </script>
</head>
<body><p>Body text.</p></body>
</html>`;

  it("uses JSON-LD datePublished over article:published_time", async () => {
    const fetchImpl = mockFetchWithHtml(200, JSON_LD_HTML);
    const fetch = createWebFetch({ fetchImpl });
    const meta = await fetch("https://example.com/article");
    expect(meta).not.toBeNull();
    // JSON-LD date is 2026-08-15, article:published_time is 2026-05-20 — JSON-LD wins
    expect(meta!.publishedTime).toBe("2026-08-15");
  });

  it("uses JSON-LD publisher.name over og:site_name", async () => {
    const fetchImpl = mockFetchWithHtml(200, JSON_LD_HTML);
    const fetch = createWebFetch({ fetchImpl });
    const meta = await fetch("https://example.com/article");
    expect(meta!.publisherHint).toBe("JSON-LD Publisher");
  });

  it("uses JSON-LD headline as title fallback when og:title absent", async () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>HTML Title Only</title>
  <script type="application/ld+json">
  { "@type": "NewsArticle", "headline": "JSON-LD Headline Fallback" }
  </script>
</head>
<body></body>
</html>`;
    const fetchImpl = mockFetchWithHtml(200, html);
    const fetch = createWebFetch({ fetchImpl });
    const meta = await fetch("https://example.com/article");
    expect(meta!.title).toBe("JSON-LD Headline Fallback");
  });

  it("handles multiple JSON-LD blocks gracefully", async () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Title</title>
  <script type="application/ld+json">{ "@type": "WebPage" }</script>
  <script type="application/ld+json">
  { "@type": "NewsArticle", "datePublished": "2026-09-01T00:00:00Z" }
  </script>
</head>
<body></body>
</html>`;
    const fetchImpl = mockFetchWithHtml(200, html);
    const fetch = createWebFetch({ fetchImpl });
    const meta = await fetch("https://example.com/article");
    // First JSON-LD block has no date, second has it
    expect(meta!.publishedTime).toBe("2026-09-01");
  });

  it("ignores malformed JSON-LD blocks", async () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Title</title>
  <script type="application/ld+json">invalid json</script>
  <meta property="article:published_time" content="2026-03-15T12:00:00Z" />
</head>
<body></body>
</html>`;
    const fetchImpl = mockFetchWithHtml(200, html);
    const fetch = createWebFetch({ fetchImpl });
    const meta = await fetch("https://example.com/article");
    // Falls through to article:published_time
    expect(meta!.publishedTime).toBe("2026-03-15");
  });
});

// ── Date fallback priority chain ─────────────────────────────────────────────

describe("createWebFetch — date fallback priority", () => {
  it("extracts date from meta[name=date]", async () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
  <meta name="date" content="2026-04-10" />
</head>
<body></body>
</html>`;
    const fetchImpl = mockFetchWithHtml(200, html);
    const fetch = createWebFetch({ fetchImpl });
    const meta = await fetch("https://example.com/article");
    expect(meta!.publishedTime).toBe("2026-04-10");
  });

  it("extracts date from meta[itemprop=datePublished]", async () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
  <meta itemprop="datePublished" content="2026-04-15" />
</head>
<body></body>
</html>`;
    const fetchImpl = mockFetchWithHtml(200, html);
    const fetch = createWebFetch({ fetchImpl });
    const meta = await fetch("https://example.com/article");
    expect(meta!.publishedTime).toBe("2026-04-15");
  });

  it("extracts date from <time datetime>", async () => {
    const html = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body><time datetime="2026-04-20">April 20, 2026</time></body>
</html>`;
    const fetchImpl = mockFetchWithHtml(200, html);
    const fetch = createWebFetch({ fetchImpl });
    const meta = await fetch("https://example.com/article");
    expect(meta!.publishedTime).toBe("2026-04-20");
  });

  it("returns undefined when no date source is available", async () => {
    const html = `<!DOCTYPE html>
<html>
<head><title>No Date</title></head>
<body></body>
</html>`;
    const fetchImpl = mockFetchWithHtml(200, html);
    const fetch = createWebFetch({ fetchImpl });
    const meta = await fetch("https://example.com/article");
    expect(meta!.publishedTime).toBeUndefined();
  });

  it("normalizes article:published_time to YYYY-MM-DD", async () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
  <meta property="article:published_time" content="2026-06-25T14:30:00+05:00" />
</head>
<body></body>
</html>`;
    const fetchImpl = mockFetchWithHtml(200, html);
    const fetch = createWebFetch({ fetchImpl });
    const meta = await fetch("https://example.com/article");
    expect(meta!.publishedTime).toBe("2026-06-25");
  });

  it("only returns dates matching YYYY-MM-DD; non-parseable dates become undefined", async () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
  <meta property="article:published_time" content="August 28, 2026" />
</head>
<body></body>
</html>`;
    const fetchImpl = mockFetchWithHtml(200, html);
    const fetch = createWebFetch({ fetchImpl });
    const meta = await fetch("https://example.com/article");
    expect(meta!.publishedTime).toBeUndefined();
  });
});

// ── Existing behavior preserved ─────────────────────────────────────────────

describe("createWebFetch — existing behavior", () => {
  const BASIC_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Test Article Title</title>
  <meta property="og:title" content="OG Title Override" />
  <meta property="og:description" content="This is an OG description for the article." />
  <meta property="article:published_time" content="2026-05-20T12:00:00Z" />
  <meta property="og:site_name" content="The Example Times" />
  <meta property="og:type" content="article" />
  <link rel="canonical" href="https://example.com/canonical-url" />
</head>
<body><p>Body text should never be included in the output.</p></body>
</html>`;

  it("parses metadata from an HTML fixture", async () => {
    const fetchImpl = mockFetchWithHtml(200, BASIC_HTML, "https://example.com/article");
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

  it("returns null on 404", async () => {
    const fetchImpl = mockFetchWithHtml(404, "<html></html>");
    const fetch = createWebFetch({ fetchImpl });

    const meta = await fetch("https://example.com/missing");
    expect(meta).toBeNull();
  });

  it("returns null on network error", async () => {
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