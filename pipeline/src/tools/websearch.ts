/**
 * pipeline/src/tools/websearch.ts — Tavily search adapter
 *
 * Searches the web via the Tavily API for recent editorial coverage.
 * Configurable apiKey (env TAVILY_API_KEY), maxResults, and date window.
 *
 * Per IMPLEMENTATION.md §6.1 research agent workflow step 2:
 * "Search the web for recent editorial coverage matching the keywords within
 *  the requested date window (default: last 90 days)."
 */

import type { FetchImpl } from "../providers/types.js";

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
}

interface TavilyResponse {
  results: Array<{
    title: string;
    url: string;
    content: string;
    published_date?: string;
  }>;
  answer?: string;
  query?: string;
}

/**
 * Create a Tavily search function with optional overrides.
 *
 * @param opts.apiKey   Tavily API key (defaults to process.env.TAVILY_API_KEY)
 * @param opts.fetchImpl  Injectable fetch for testing
 */
export function createTavilySearch(
  opts?: { apiKey?: string; fetchImpl?: FetchImpl },
): (query: string, opts2?: { maxResults?: number; days?: number; includeDomains?: string[] }) => Promise<SearchResult[]> {
  const apiKey = opts?.apiKey ?? process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "TAVILY_API_KEY is required. Set it via options or the TAVILY_API_KEY environment variable.",
    );
  }
  const doFetch: FetchImpl = opts?.fetchImpl ?? globalThis.fetch;

  return async (query: string, opts2?: { maxResults?: number; days?: number; includeDomains?: string[] }): Promise<SearchResult[]> => {
    const maxResults = opts2?.maxResults ?? 10;
    const days = opts2?.days ?? 90;

    const body = {
      api_key: apiKey,
      query,
      max_results: maxResults,
      topic: "news" as const,
      days,
      search_depth: "basic" as const,
      ...(opts2?.includeDomains?.length ? { include_domains: opts2.includeDomains } : {}),
    };

    let response: Response;
    try {
      response = await doFetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err: unknown) {
      throw new Error(`Tavily search network error: ${(err as Error).message}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Tavily search returned ${response.status}: ${text || response.statusText}`,
      );
    }

    let data: TavilyResponse;
    try {
      data = (await response.json()) as TavilyResponse;
    } catch {
      throw new Error("Tavily search returned non-JSON response");
    }

    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }

    return data.results.map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: r.content ?? "",
      publishedDate: r.published_date ?? undefined,
    }));
  };
}