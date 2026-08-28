/**
 * pipeline/src/tools/webfetch.ts — Metadata-only page fetcher
 *
 * Fetches a URL, extracts metadata (title, description, published time,
 * publisher hint) via cheerio, and returns a PageMeta object.
 *
 * NEVER stores or returns page body text — per IMPLEMENTATION.md §5.1
 * fullText extraction is disabled as long as all policies have fullText: false.
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
  /** Published time from article:published_time or <time datetime> */
  publishedTime?: string;
  /** Publisher/site name from og:site_name */
  publisherHint?: string;
  /** Open Graph type (article, website, etc.) */
  ogType?: string;
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

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

    // Title: prefer og:title, fall back to <title>
    const ogTitle = $('meta[property="og:title"]').attr("content");
    const htmlTitle = $("title").text().trim();
    const title = ogTitle || htmlTitle || "";

    // Description: prefer og:description, fall back to meta[name=description]
    const ogDesc = $('meta[property="og:description"]').attr("content");
    const metaDesc = $('meta[name="description"]').attr("content");
    const description = ogDesc || metaDesc || "";

    // Published time: article:published_time or <time datetime>
    const articleTime = $('meta[property="article:published_time"]').attr("content");
    const timeTag = $("time").attr("datetime");
    const publishedTime = articleTime || timeTag || undefined;

    // Publisher hint: og:site_name
    const siteName = $('meta[property="og:site_name"]').attr("content");
    const publisherHint = siteName || undefined;

    // Open Graph type
    const ogType = $('meta[property="og:type"]').attr("content") || undefined;

    // Canonical URL for finalUrl fallback
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