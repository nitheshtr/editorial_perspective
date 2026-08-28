/**
 * pipeline/src/agent.ts — Frontmatter parser for agents/*.md
 *
 * Parses the flat key: value frontmatter section (between --- delimiters)
 * and returns structured agent metadata + prompt body.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

export interface AgentDef {
  id: string;
  stage: string;
  model: string;
  tools: string[];
  writeScope: string[];
  body: string;
}

/**
 * Parse an agent markdown file, extracting frontmatter and body.
 * Frontmatter format:
 *   key: value
 *   inline array: tools: [a, b]
 *   block list: writeScope:
 *     - item
 *   Everything after second --- is the body.
 */
export function parseAgent(md: string): AgentDef {
  const lines = md.split("\n");

  // Find frontmatter boundaries
  let firstDash = -1;
  let secondDash = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim() === "---") {
      if (firstDash === -1) firstDash = i;
      else { secondDash = i; break; }
    }
  }

  if (firstDash === -1 || secondDash === -1) {
    throw new Error("Agent file missing frontmatter (--- delimiters)");
  }

  const frontmatterLines = lines.slice(firstDash + 1, secondDash);
  const body = lines.slice(secondDash + 1).join("\n").trim();

  const result: AgentDef = {
    id: "",
    stage: "",
    model: "",
    tools: [],
    writeScope: [],
    body,
  };

  let inWriteScope = false;
  let inBlockList = false;

  for (let i = 0; i < frontmatterLines.length; i++) {
    const line = frontmatterLines[i]!;
    const trimmed = line.trim();

    // Skip empty lines and inline comments
    if (trimmed === "" || trimmed.startsWith("#")) {
      inWriteScope = false;
      inBlockList = false;
      continue;
    }

    // Check if we're continuing a writeScope block list
    if (inWriteScope && trimmed.startsWith("- ")) {
      result.writeScope.push(trimmed.slice(2).trim());
      continue;
    }

    // Check if we're continuing a tools block list (rare)
    if (inBlockList && trimmed.startsWith("- ")) {
      result.tools.push(trimmed.slice(2).trim());
      continue;
    }

    inWriteScope = false;
    inBlockList = false;

    // Parse key: value
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    switch (key) {
      case "id":
        result.id = value;
        break;
      case "stage":
        result.stage = value;
        break;
      case "model":
        result.model = value;
        break;
      case "tools": {
        // Inline array: tools: [a, b]
        const bracketMatch = value.match(/^\[(.*)\]$/);
        if (bracketMatch) {
          result.tools = bracketMatch[1]!.split(",").map((s) => s.trim().replace(/['"]/g, "")).filter(Boolean);
        } else if (value === "") {
          // Empty inline array or block list follows
          inBlockList = true;
        }
        break;
      }
      case "writeScope": {
        const bracketMatch = value.match(/^\[(.*)\]$/);
        if (bracketMatch) {
          result.writeScope = bracketMatch[1]!.split(",").map((s) => s.trim().replace(/['"]/g, "")).filter(Boolean);
        } else if (value === "") {
          // Empty inline array or block list follows
          inWriteScope = true;
        }
        break;
      }
    }
  }

  return result;
}

/**
 * Load and parse an agent file from agents/ dir.
 */
export function loadAgent(agentName: string): AgentDef {
  const agentPath = join(ROOT, "agents", `${agentName}.md`);
  const content = readFileSync(agentPath, "utf-8");
  return parseAgent(content);
}

/**
 * Load an agent file by stage name (research, analysis, writing, apply).
 */
export function loadAgentByStage(stage: string): AgentDef {
  const agentMap: Record<string, string> = {
    research: "research-agent",
    analysis: "analysis-agent",
    writing: "writing-assistant",
    apply: "content-manager",
  };

  const agentName = agentMap[stage];
  if (!agentName) {
    throw new Error(`Unknown stage: "${stage}"`);
  }

  return loadAgent(agentName);
}