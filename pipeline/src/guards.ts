/**
 * pipeline/src/guards.ts — path allowlist enforcement per agent writeScope (§13)
 *
 * - parseWriteScopes(frontmatter): parse the writeScope block from agent frontmatter
 * - assertWriteAllowed(root, scopes, absPath): throws GuardError if path outside scope
 * - isPathInsideScope(relPath, scopes): pure check for unit tests
 * - appendOnly(name) registry + assertAppendOnly for cache enforcement
 */

import { relative, resolve, sep, normalize } from "node:path";
import { readFileSync, existsSync } from "node:fs";

export class GuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardError";
  }
}

/**
 * Check whether a relative path is inside any of the given scope prefixes.
 * A scope like "data/topics/" matches "data/topics/ai-superrace.json" and
 * "data/topics/".
 * A scope like "data/articles/articles_cache.json" matches only that exact file.
 */
export function isPathInsideScope(relPath: string, scopes: string[]): boolean {
  const normalized = normalize(relPath).replace(/\\/g, "/");
  for (const scope of scopes) {
    const normalizedScope = normalize(scope).replace(/\\/g, "/");
    if (normalized === normalizedScope) return true;
    // If scope ends with / or is a directory prefix
    const scopeDir = normalizedScope.endsWith("/") ? normalizedScope : normalizedScope + "/";
    if (normalized.startsWith(scopeDir)) return true;
    // Also match exact file paths that aren't directory prefixes
    // e.g., scope = "data/topics" dir should match files inside
    if (normalized.startsWith(normalizedScope + "/")) return true;
  }
  return false;
}

/**
 * Parse writeScope frontmatter field: "writeScope:\n  - item1\n  - item2"
 * Returns array of scope strings.
 */
export function parseWriteScopes(frontmatter: string): string[] {
  const lines = frontmatter.split("\n");
  const scopes: string[] = [];
  let inWriteScope = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith("writeScope:")) {
      inWriteScope = true;
      // Check for inline array: writeScope: [a, b]
      const bracketMatch = line.match(/writeScope:\s*\[(.*)\]/);
      if (bracketMatch && bracketMatch[1]) {
        return bracketMatch[1].split(",").map((s) => s.trim().replace(/['"]/g, "")).filter(Boolean);
      }
      // Check for empty inline: writeScope: []
      if (line.includes("[]")) {
        return [];
      }
      continue;
    }
    if (inWriteScope) {
      // Stop at next key-value pair (non-indented line or next frontmatter key)
      if (!line.startsWith("  - ") && !line.startsWith("    ")) {
        inWriteScope = false;
        continue;
      }
      const match = line.match(/^\s*-\s+(.+)$/);
      if (match) {
        scopes.push(match[1]!.trim().replace(/['"]/g, "").replace(/\s*#.*$/, "").trim());
      }
    }
  }
  return scopes;
}

/**
 * Assert that an absolute path is within the allowed write scopes.
 * Throws GuardError if not.
 */
export function assertWriteAllowed(root: string, scopes: string[], absPath: string): void {
  const relPath = relative(root, absPath).replace(/\\/g, "/");
  if (!isPathInsideScope(relPath, scopes)) {
    throw new GuardError(
      `Write denied: "${relPath}" is not in allowed scopes [${scopes.join(", ")}]`
    );
  }
}

/**
 * Append-only registry — currently tracks data/articles/articles_cache.json
 * as append-only.
 */
const APPEND_ONLY_FILES = new Set(["data/articles/articles_cache.json"]);

/**
 * Register a file path as append-only.
 */
export function registerAppendOnly(name: string): void {
  APPEND_ONLY_FILES.add(name.replace(/\\/g, "/"));
}

/**
 * Check if a file is in the append-only registry.
 */
export function isAppendOnly(relPath: string): boolean {
  return APPEND_ONLY_FILES.has(relPath.replace(/\\/g, "/"));
}

/**
 * Enforce that a newly written articles cache is strictly append-only:
 * same prior articles + zero or more new articles, no removals/modifications.
 * Comparison is by article `id`.
 */
export function assertAppendOnly(
  previous: { articles: Array<{ id: string }> },
  current: { articles: Array<{ id: string }> }
): void {
  const prevIds = previous.articles.map((a) => a.id);
  const currIds = current.articles.map((a) => a.id);

  // Check no removals or modifications
  for (let i = 0; i < prevIds.length; i++) {
    if (currIds[i] !== prevIds[i]) {
      throw new GuardError(
        `Append-only violation: article at index ${i} changed from "${prevIds[i]}" to "${currIds[i]}"`
      );
    }
  }

  // Check no extra removals
  if (currIds.length < prevIds.length) {
    throw new GuardError(
      `Append-only violation: ${prevIds.length - currIds.length} article(s) removed`
    );
  }
}