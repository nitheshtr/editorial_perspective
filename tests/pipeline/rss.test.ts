/**
 * tests/pipeline/rss.test.ts
 *
 * Tests for the RSS/Atom feed reader:
 * - RSS 2.0 parsing with CDATA
 * - Atom feed parsing
 * - RFC-822 pubDate → YYYY-MM-DD
 * - Feed 404/error → []
 * - Missing fields → graceful skip
 */

import { describe, it, expect, vi } from "vitest";
import { createRssReader, type RssItem } from "../../pipeline/src/tools/rss.js";

// ── Mock helpers ─────────────────────────────────────────────────────────────

function mockFetchForXml(status: number, xml: string, finalUrl?: string) {
  return vi.fn(async (url: string) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    url: finalUrl ?? url,
    json: async () => { throw new Error("Not XML"); },
    text: async () => xml,
    headers: new Headers({ "content-type": "application/rss+xml" }),
  })) as unknown as typeof globalThis.fetch;
}

// ── RSS 2.0 fixtures ────────────────────────────────────────────────────────

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <description>A test RSS feed</description>
    <item>
      <title>First Article</title>
      <link>https://example.com/first</link>
      <description>A description of the first article.</description>
      <pubDate>Tue, 15 Aug 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title><![CDATA[Second <Article> with CDATA]]></title>
      <link>https://example.com/second</link>
      <description><![CDATA[<p>CDATA description content</p>]]></description>
      <pubDate>Wed, 16 Aug 2026 14:30:00 GMT</pubDate>
    </item>
    <item>
      <title>Third Article (no date)</title>
      <link>https://example.com/third</link>
      <description>No pubDate on this one.</description>
    </item>
  </channel>
</rss>`;

const ATOM_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Test Feed</title>
  <link href="https://example.com/atom"/>
  <entry>
    <title>Atom Entry One</title>
    <link href="https://example.com/atom/one" rel="alternate"/>
    <published>2026-08-20T08:00:00Z</published>
    <summary>Summary of entry one.</summary>
  </entry>
  <entry>
    <title>Atom Entry Two</title>
    <link href="https://example.com/atom/two"/>
    <updated>2026-08-21T12:00:00Z</updated>
    <summary><![CDATA[<b>CDATA summary</b>]]></summary>
  </entry>
  <entry>
    <title>Atom Entry Three (no date)</title>
    <link href="https://example.com/atom/three" rel="alternate"/>
  </entry>
</feed>`;

// ── RSS 2.0 tests ────────────────────────────────────────────────────────────

describe("createRssReader — RSS 2.0", () => {
  it("parses RSS 2.0 items with titles, links, dates", async () => {
    const fetchImpl = mockFetchForXml(200, RSS_FIXTURE);
    const reader = createRssReader({ fetchImpl });
    const items = await reader("https://example.com/feed.xml");

    expect(items).toHaveLength(3);

    expect(items[0]!.title).toBe("First Article");
    expect(items[0]!.url).toBe("https://example.com/first");
    expect(items[0]!.publishedDate).toBe("2026-08-15");
    expect(items[0]!.description).toBe("A description of the first article.");
  });

  it("strips CDATA wrappers from title and description", async () => {
    const fetchImpl = mockFetchForXml(200, RSS_FIXTURE);
    const reader = createRssReader({ fetchImpl });
    const items = await reader("https://example.com/feed.xml");

    expect(items[1]!.title).toBe("Second <Article> with CDATA");
    expect(items[1]!.description).toBe("<p>CDATA description content</p>");
  });

  it("parses RFC-822 dates to YYYY-MM-DD", async () => {
    const fetchImpl = mockFetchForXml(200, RSS_FIXTURE);
    const reader = createRssReader({ fetchImpl });
    const items = await reader("https://example.com/feed.xml");

    expect(items[0]!.publishedDate).toBe("2026-08-15");
    expect(items[1]!.publishedDate).toBe("2026-08-16");
  });

  it("handles missing pubDate gracefully", async () => {
    const fetchImpl = mockFetchForXml(200, RSS_FIXTURE);
    const reader = createRssReader({ fetchImpl });
    const items = await reader("https://example.com/feed.xml");

    expect(items[2]!.publishedDate).toBeUndefined();
    expect(items[2]!.title).toBe("Third Article (no date)");
  });

  it("skips items missing title or link", async () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><title>Good</title><link>https://example.com/good</link></item>
  <item><title>No Link</title></item>
  <item><link>https://example.com/no-title</link></item>
</channel></rss>`;
    const fetchImpl = mockFetchForXml(200, xml);
    const reader = createRssReader({ fetchImpl });
    const items = await reader("https://example.com/feed.xml");

    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Good");
  });
});

// ── Atom tests ───────────────────────────────────────────────────────────────

describe("createRssReader — Atom", () => {
  it("parses Atom entries with titles, links, dates", async () => {
    const fetchImpl = mockFetchForXml(200, ATOM_FIXTURE);
    const reader = createRssReader({ fetchImpl });
    const items = await reader("https://example.com/atom.xml");

    expect(items).toHaveLength(3);

    expect(items[0]!.title).toBe("Atom Entry One");
    expect(items[0]!.url).toBe("https://example.com/atom/one");
    expect(items[0]!.publishedDate).toBe("2026-08-20");
    expect(items[0]!.description).toBe("Summary of entry one.");
  });

  it("uses updated as fallback when published is absent", async () => {
    const fetchImpl = mockFetchForXml(200, ATOM_FIXTURE);
    const reader = createRssReader({ fetchImpl });
    const items = await reader("https://example.com/atom.xml");

    expect(items[1]!.publishedDate).toBe("2026-08-21");
  });

  it("handles entries with no date", async () => {
    const fetchImpl = mockFetchForXml(200, ATOM_FIXTURE);
    const reader = createRssReader({ fetchImpl });
    const items = await reader("https://example.com/atom.xml");

    expect(items[2]!.publishedDate).toBeUndefined();
  });

  it("strips CDATA from Atom summary", async () => {
    const fetchImpl = mockFetchForXml(200, ATOM_FIXTURE);
    const reader = createRssReader({ fetchImpl });
    const items = await reader("https://example.com/atom.xml");

    expect(items[1]!.description).toBe("<b>CDATA summary</b>");
  });
});

// ── Error handling ───────────────────────────────────────────────────────────

describe("createRssReader — error handling", () => {
  it("returns [] on 404", async () => {
    const fetchImpl = mockFetchForXml(404, "<html>not found</html>");
    const reader = createRssReader({ fetchImpl });
    const items = await reader("https://example.com/missing");
    expect(items).toEqual([]);
  });

  it("returns [] on network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("Network failure");
    }) as unknown as typeof globalThis.fetch;
    const reader = createRssReader({ fetchImpl });
    const items = await reader("https://example.com/down");
    expect(items).toEqual([]);
  });

  it("returns [] on non-RSS/Atom XML", async () => {
    const xml = `<?xml version="1.0"?><notFeed><notItem/></notFeed>`;
    const fetchImpl = mockFetchForXml(200, xml);
    const reader = createRssReader({ fetchImpl });
    const items = await reader("https://example.com/unknown");
    expect(items).toEqual([]);
  });
});