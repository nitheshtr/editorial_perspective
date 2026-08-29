/**
 * pipeline/src/tools/webfetch.ts — Metadata-only page fetcher
 *
 * Fetches a URL, extracts metadata (title, description, published time,
 * publisher hint) via cheerio, and returns a PageMeta object.
 *
 * NEVER stores or returns page body text — per IMPLEMENTATION.md §5.1
 * fullText extraction is disabled as long as all policies have fullText: false.
 *
 * Date extraction priority chain (S3, first hit wins):
 * 1. JSON-LD: datePublished/dateModified → publisher.name → headline
 * 2. Existing metas: article:published_time, og:title, og:description, og:site_name
 * 3. Fallback: meta[name="date"], meta[itemprop="datePublished"], <time datetime>
 * 4. Only return YYYY-MM-DD normalized dates; non-parseable → absent (runner handles)
 */

import type { FetchImpl } from "../providers/types.js";
import * as cheerio from "cheerio";

export interface PageMeta {
  /** The final URL after redirects (or original if not redirected) */
  finalUrl: string;
  /** Page title: <title> or og:title */
  title: string;
  /** Page description: og:description or meta[name=description] */
  description: string;
  /** Published time from JSON-LD, article:published_time, or <time datetime> */
  publishedTime?: string;
  /** Publisher/site name from og:site_name or JSON-LD publisher.name */
  publisherHint?: string;
  /** Open Graph type (article, website, etc.) */
  ogType?: string;
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/**
 * Extract a YYYY-MM-DD date string from a JSON-LD block.
 *
 * Pure function — no DOM dependency, unit-testable directly.
 * Walks @graph-wrapped and array forms.
 * Priority within JSON-LD: datePublished → dateModified.
 * Returns "" if nothing parseable is found.
 */
export function extractDateFromJsonLd(json: unknown): string {
  if (!json || typeof json !== "object") return "";

  // Normalise to an array of item-like objects
  const items: Array<Record<string, unknown>> = [];

  const obj = json as Record<string, unknown>;

  // Handle @graph wrapper (schema.org patterns)
  if (obj["@graph"] && Array.isArray(obj["@graph"])) {
    items.push(...(obj["@graph"] as Array<Record<string, unknown>>));
  }

  // Handle array of JSON-LD objects
  if (Array.isArray(json)) {
    items.push(...(json as Array<Record<string, unknown>>));
  }

  // Handle standalone object
  if (!Array.isArray(json) && obj["@type"]) {
    items.push(obj);
  }

  for (const item of items) {
    // Try datePublished first, then dateModified
    const rawDate = (item.datePublished as string) || (item.dateModified as string) || "";
    if (rawDate) {
      const slice = rawDate.slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(slice)) return slice;
    }
  }

  return "";
}

/**
 * Extract a publisher name hint from a JSON-LD block.
 * Returns the first publisher.name found, or "".
 */
function extractPublisherFromJsonLd(json: unknown): string {
  if (!json || typeof json !== "object") return "";

  const items: Array<Record<string, unknown>> = [];
  const obj = json as Record<string, unknown>;

  if (obj["@graph"] && Array.isArray(obj["@graph"])) {
    items.push(...(obj["@graph"] as Array<Record<string, unknown>>));
  }
  if (Array.isArray(json)) {
    items.push(...(json as Array<Record<string, unknown>>));
  }
  if (!Array.isArray(json) && obj["@type"]) {
    items.push(obj);
  }

  for (const item of items) {
    const publisher = item.publisher as Record<string, unknown> | undefined;
    if (publisher && typeof publisher.name === "string" && publisher.name.trim()) {
      return publisher.name.trim();
    }
  }

  return "";
}

/**
 * Extract a headline from a JSON-LD block.
 * Returns the first headline found, or "".
 */
function extractHeadlineFromJsonLd(json: unknown): string {
  if (!json || typeof json !== "object") return "";

  const items: Array<Record<string, unknown>> = [];
  const obj = json as Record<string, unknown>;

  if (obj["@graph"] && Array.isArray(obj["@graph"])) {
    items.push(...(obj["@graph"] as Array<Record<string, unknown>>));
  }
  if (Array.isArray(json)) {
    items.push(...(json as Array<Record<string, unknown>>));
  }
  if (!Array.isArray(json) && obj["@type"]) {
    items.push(obj);
  }

  for (const item of items) {
    if (typeof item.headline === "string" && item.headline.trim()) {
      return item.headline.trim();
    }
  }

  return "";
}

/**
 * Normalise a date-ish string to YYYY-MM-DD.
 * Returns "" if the input doesn't yield a valid ISO date prefix.
 */
function normaliseDate(raw: string | undefined): string {
  if (!raw) return "";
  const slice = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(slice)) return slice;
  return "";
}

/**
 * Create a web-fetch function that extracts page metadata.
 *
 * @param opts.fetchImpl  Injectable fetch for testing
 */
export function createWebFetch(
  opts?: { fetchImpl?: FetchImpl },
): (url: string) => Promise<PageMeta | null> {
  const doFetch: FetchImpl = opts?.fetchImpl ?? globalThis.fetch;

  return async (url: string): Promise<PageMeta | null> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let response: Response;
    try {
      response = await doFetch(url, {
        method: "GET",
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        signal: controller.signal,
        redirect: "follow",
      });
    } catch (err: unknown) {
      // AbortError or network error — caller skips
      return null;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      // Non-200 (paywall, 404, blocked, etc.) — caller skips
      return null;
    }

    const finalUrl = response.url;
    const html = await response.text();

    const $ = cheerio.load(html);

    // ── JSON-LD block extraction (priority tier 1) ──────────────────────
    let jsonLdDate = "";
    let jsonLdPublisher = "";
    let jsonLdHeadline = "";

    $('script[type="application/ld+json"]').each((_i, el) => {
      const raw = $(el).html();
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (!jsonLdDate) jsonLdDate = extractDateFromJsonLd(parsed);
        if (!jsonLdPublisher) jsonLdPublisher = extractPublisherFromJsonLd(parsed);
        if (!jsonLdHeadline) jsonLdHeadline = extractHeadlineFromJsonLd(parsed);
      } catch {
        // Invalid JSON-LD block — skip
      }
    });

    // ── Title (priority: og:title → JSON-LD headline → <title>) ────────
    const ogTitle = $('meta[property="og:title"]').attr("content");
    const htmlTitle = $("title").text().trim();
    const title = ogTitle || jsonLdHeadline || htmlTitle || "";

    // ── Description: prefer og:description, fall back to meta[name=description]
    const ogDesc = $('meta[property="og:description"]').attr("content");
    const metaDesc = $('meta[name="description"]').attr("content");
    const description = ogDesc || metaDesc || "";

    // ── Published time: priority chain ──────────────────────────────────
    // Tier 1: JSON-LD date
    // Tier 2: article:published_time meta
    // Tier 3: meta[name="date"], meta[itemprop="datePublished"], <time datetime>
    const articleTime = $('meta[property="article:published_time"]').attr("content");
    const metaDate = $('meta[name="date"]').attr("content");
    const metaItempropDate = $('meta[itemprop="datePublished"]').attr("content");
    const timeTag = $("time").attr("datetime");

    const rawPublished =
      jsonLdDate ||
      normaliseDate(articleTime) ||
      normaliseDate(metaDate) ||
      normaliseDate(metaItempropDate) ||
      normaliseDate(timeTag);

    const publishedTime = rawPublished || undefined;

    // ── Publisher hint: JSON-LD publisher.name → og:site_name ──────────
    const siteName = $('meta[property="og:site_name"]').attr("content");
    const publisherHint = jsonLdPublisher || siteName || undefined;

    // ── Open Graph type ─────────────────────────────────────────────────
    const ogType = $('meta[property="og:type"]').attr("content") || undefined;

    // ── Canonical URL for finalUrl fallback ─────────────────────────────
    const canonical = $('link[rel="canonical"]').attr("href");
    const resolvedUrl = canonical || finalUrl;

    return {
      finalUrl: resolvedUrl,
      title,
      description,
      publishedTime,
      publisherHint,
      ogType,
    };
  };
}