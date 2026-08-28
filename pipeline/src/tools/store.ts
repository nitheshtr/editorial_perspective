/**
 * pipeline/src/tools/store.ts — Repository layer for pipeline data
 *
 * All reads/writes of data/** go through this layer. Writes are guarded
 * by guards.ts path allowlists. Articles cache enforces append-only.
 *
 * ADR-004: stateless functions over typed artifacts; swap storage by
 * replacing this layer.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { assertWriteAllowed, assertAppendOnly, isAppendOnly, GuardError } from "../guards.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");
export const DATA_DIR = join(ROOT, "data");

export interface ArticlesCache {
  articles: Array<{ id: string } & Record<string, unknown>>;
  migratedFrom?: string;
}

export interface TopicManifest {
  topics: Array<{ slug: string; title: string; file: string; added: string }>;
  active: string;
}

export interface RegistryCache {
  publishers: Array<{ name: string; tier: number } & Record<string, unknown>>;
}

/**
 * Read a JSON file from under data/.
 */
export function readJson<T = unknown>(relPath: string): T {
  const absPath = resolve(DATA_DIR, relPath);
  const content = readFileSync(absPath, "utf-8");
  return JSON.parse(content) as T;
}

/**
 * Write a JSON file under data/, guarded by write scopes.
 * If the path is registered as append-only, performs an append-only check.
 */
export function writeJson<T>(relPath: string, data: T, scopes: string[]): void {
  const absPath = resolve(DATA_DIR, relPath);
  // Agent scopes and the append-only registry are ROOT-relative (frontmatter
  // contract: "data/...") — normalize before guarding.
  const rootRel = relative(ROOT, absPath).replace(/\\/g, "/");

  // Guard: check write scope
  assertWriteAllowed(ROOT, scopes, absPath);

  // Append-only check for articles cache
  if (isAppendOnly(rootRel) && existsSync(absPath)) {
    const prev = readJson<ArticlesCache>(relPath);
    const curr = data as unknown as ArticlesCache;
    if (prev && prev.articles && curr && curr.articles) {
      assertAppendOnly(prev, curr);
    }
  }

  // Ensure target directory exists
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Append new articles to the cache, enforcing append-only semantics.
 */
export function appendArticles(
  cacheRelPath: string,
  newArticles: Array<{ id: string } & Record<string, unknown>>,
  scopes: string[],
): void {
  const absPath = resolve(DATA_DIR, cacheRelPath);
  assertWriteAllowed(ROOT, scopes, absPath);

  const existing: ArticlesCache = existsSync(absPath)
    ? readJson<ArticlesCache>(cacheRelPath)
    : { articles: [] };

  // Check for duplicates by id
  const existingIds = new Set(existing.articles.map((a) => a.id));
  const trulyNew = newArticles.filter((a) => !existingIds.has(a.id));

  const updated: ArticlesCache = {
    ...existing,
    articles: [...existing.articles, ...trulyNew],
  };

  // Append-only check (should pass since we only add, never modify/remove)
  if (existing.articles.length > 0) {
    assertAppendOnly(
      { articles: existing.articles.map((a) => ({ id: a.id })) },
      { articles: updated.articles.map((a) => ({ id: a.id })) },
    );
  }

  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, JSON.stringify(updated, null, 2) + "\n", "utf-8");
}

/**
 * Backup a topic JSON to data/backups/{slug}/{timestamp}.json
 * Returns the backup path.
 */
export function backupTopic(slug: string): string {
  const topicPath = join(DATA_DIR, "topics", `${slug}.json`);
  if (!existsSync(topicPath)) {
    throw new GuardError(`Topic not found: ${slug}`);
  }

  const timestamp = Date.now();
  const backupDir = join(DATA_DIR, "backups", slug);
  mkdirSync(backupDir, { recursive: true });

  const backupPath = join(backupDir, `${timestamp}.json`);
  copyFileSync(topicPath, backupPath);
  return backupPath;
}

/** Load a topic JSON by slug. */
export function loadTopic<T = Record<string, unknown>>(slug: string): T {
  return readJson<T>(join("topics", `${slug}.json`));
}

/** Load articles cache. */
export function loadArticles(): ArticlesCache {
  if (!existsSync(join(DATA_DIR, "articles", "articles_cache.json"))) {
    return { articles: [] };
  }
  return readJson<ArticlesCache>(join("articles", "articles_cache.json"));
}

/** Load publisher registry. */
export function loadRegistry(): RegistryCache {
  if (!existsSync(join(DATA_DIR, "config", "publishers.json"))) {
    return { publishers: [] };
  }
  return readJson<RegistryCache>(join("config", "publishers.json"));
}

/** Load topic manifest. */
export function loadManifest(): TopicManifest {
  return readJson<TopicManifest>(join("topics", "index.json"));
}

/** Check if a file exists and get its mtime. */
export function getMtime(relPath: string): Date | null {
  const absPath = join(DATA_DIR, relPath);
  if (!existsSync(absPath)) return null;
  return statSync(absPath).mtime;
}