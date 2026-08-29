/**
 * pipeline/src/tools/rss.ts — RSS/Atom feed reader
 *
 * Fetches and parses RSS 2.0 and Atom feeds, returning a list of items
 * with title, URL, published date (YYYY-MM-DD), and description.
 *
 * Non-200 responses are skipped gracefully (return []).
 * RFC-822 and ISO 8601 dates are normalised to YYYY-MM-DD.
 */

import type { FetchImpl } from "../providers/types.js";
import * as cheerio from "cheerio";

export interface RssItem {
  title: string;
  url: string;
  publishedDate?: string;
  description?: string;
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/**
 * Strip CDATA wrapper from a string, if present.
 */
function stripCdata(raw: string): string {
  return raw.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "");
}

/**
 * Try to parse a date string and return YYYY-MM-DD.
 * Accepts ISO 8601 and RFC-822/1123 formats.
 * Returns "" if the date cannot be parsed to a valid YYYY-MM-DD.
 */
function parseDateToIso(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim();
  if (!cleaned) return undefined;

  // Try direct ISO-8601 slice first
  const slice = cleaned.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(slice)) return slice;

  // Try RFC-822 / Date.parse
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) return undefined;

  const iso = d.toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return undefined;
}

/**
 * Create an RSS/Atom feed reader.
 *
 * @param opts.fetchImpl Injectable fetch for testing
 */
export function createRssReader(
  opts?: { fetchImpl?: FetchImpl },
): (feedUrl: string) => Promise<RssItem[]> {
  const doFetch: FetchImpl = opts?.fetchImpl ?? globalThis.fetch;

  return async (feedUrl: string): Promise<RssItem[]> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let response: Response;
    try {
      response = await doFetch(feedUrl, {
        method: "GET",
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        signal: controller.signal,
        redirect: "follow",
      });
    } catch {
      // Network error — skip gracefully
      return [];
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      // Non-200 — skip gracefully
      return [];
    }

    const xml = await response.text();
    const $ = cheerio.load(xml, { xmlMode: true });

    const items: RssItem[] = [];

    // ── Detect RSS 2.0 ─────────────────────────────────────────────────
    if ($("rss").length > 0) {
      $("channel > item").each((_i, el) => {
        const $item = $(el);

        const titleRaw = $item.children("title").text();
        const title = stripCdata(titleRaw).trim();

        const linkRaw = $item.children("link").text();
        const url = linkRaw.trim();

        const pubDateRaw = $item.children("pubDate").text();
        const publishedDate = parseDateToIso(pubDateRaw);

        const descRaw = $item.children("description").text();
        const description = stripCdata(descRaw).trim().slice(0, 500) || undefined;

        if (!title || !url) return; // skip items without essential fields

        items.push({ title, url, publishedDate, description });
      });
    }
    // ── Detect Atom ────────────────────────────────────────────────────
    else if ($("feed").length > 0) {
      $("feed > entry").each((_i, el) => {
        const $entry = $(el);

        const titleRaw = $entry.children("title").text();
        const title = stripCdata(titleRaw).trim();

        // Atom link href — prefer alternate then first
        let url = "";
        $entry.children("link").each((_j, linkEl) => {
          const $link = $(linkEl);
          const rel = $link.attr("rel") || "alternate";
          const href = $link.attr("href") || "";
          if (rel === "alternate" && href) {
            url = href;
            return false; // break each loop
          }
          if (!url && href) url = href;
        });

        const updatedRaw = $entry.children("updated").text();
        const publishedRaw = $entry.children("published").text();
        const dateRaw = publishedRaw || updatedRaw;
        const publishedDate = parseDateToIso(dateRaw);

        const summaryRaw = $entry.children("summary").text();
        const description = stripCdata(summaryRaw).trim().slice(0, 500) || undefined;

        if (!title || !url) return;

        items.push({ title, url, publishedDate, description });
      });
    }

    return items;
  };
}