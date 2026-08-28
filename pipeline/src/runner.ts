/**
 * pipeline/src/runner.ts — CLI runner for the Editorial Perspective Map pipeline
 *
 * Commands per §9.1:
 *   stage=<name> topic=<slug> [run=<id>]
 *   workflow=period-update topic=<slug> [--until=approval]
 *   replay --run <id>
 *   rerun --run <id> --from <stage>
 *   approve --run <id> --decisions <file.json>
 *   report [--run <id> | --last]
 *
 * Also importable as a module for testing.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { TelemetryEmitter } from "./telemetry.js";
import { loadAgentByStage, type AgentDef } from "./agent.js";
import { OpenRouterProvider } from "./providers/openrouter.js";
import { OpenAIProvider } from "./providers/openai.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import type { LlmProvider, LlmCompleteResponse } from "./providers/types.js";
import { extractJson } from "./providers/types.js";
import {
  readJson, writeJson, appendArticles, backupTopic, loadTopic,
  loadArticles, loadRegistry, loadManifest, getMtime,
  DATA_DIR,
} from "./tools/store.js";
import { GuardError } from "./guards.js";
import { Source, ProposalSet, Approval } from "../../schema/src/index.js";
import { validateTopic } from "../../tools/validate-topic.js";
import { generateHtmlFromFile } from "../../tools/generate-site.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

// ── Config loading ──────────────────────────────────────────────────────────

function loadConfig(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, "config", "pipeline.json"), "utf-8"));
}

// ── Provider factory ─────────────────────────────────────────────────────────

function createProvider(providerName: string, fetchImpl?: typeof globalThis.fetch): LlmProvider {
  switch (providerName) {
    case "openrouter":
      return new OpenRouterProvider({ fetchImpl });
    case "openai":
      return new OpenAIProvider({ fetchImpl });
    case "anthropic":
      return new AnthropicProvider({ fetchImpl });
    default:
      throw new Error(`Unknown provider: "${providerName}"`);
  }
}

function getProviderForModel(modelKey: string, fetchImpl?: typeof globalThis.fetch): { provider: LlmProvider; config: Record<string, unknown> } {
  const config = loadConfig();
  const models = config.models as Record<string, unknown> | undefined;
  if (!models) throw new Error("No models in pipeline config");
  const modelCfg = models[modelKey] as Record<string, unknown> | undefined;
  if (!modelCfg) throw new Error(`Model "${modelKey}" not found in pipeline config`);
  const providerName = modelCfg.provider as string;
  return { provider: createProvider(providerName, fetchImpl), config: modelCfg };
}

// ── Dot-path walking ─────────────────────────────────────────────────────────

/**
 * Walk a dot path into a JSON object.
 * Numeric segments = array index; string segments = object key.
 */
function getByPath(obj: unknown, path: string): unknown {
  const segments = path.split(".");
  let current = obj;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const idx = parseInt(seg, 10);
      if (isNaN(idx)) return undefined;
      current = (current as unknown[])[idx];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Set a value at a dot path in a JSON object.
 * Creates intermediate objects/arrays as needed.
 */
function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".");
  let current = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    const nextSeg = segments[i + 1]!;
    if (Array.isArray(current)) {
      const idx = parseInt(seg, 10);
      if (isNaN(idx)) throw new Error(`Invalid array index: ${seg}`);
      if (current[idx] === undefined || current[idx] === null) {
        const nextIsNum = /^\d+$/.test(nextSeg);
        current[idx] = nextIsNum ? [] : {};
      }
      current = current[idx] as Record<string, unknown>;
    } else {
      const nextIsNum = /^\d+$/.test(nextSeg);
      if (current[seg] === undefined || current[seg] === null) {
        current[seg] = nextIsNum ? [] : {};
      }
      current = current[seg] as Record<string, unknown>;
    }
  }
  const last = segments[segments.length - 1]!;
  if (Array.isArray(current)) {
    const idx = parseInt(last, 10);
    if (!isNaN(idx)) {
      (current as unknown[])[idx] = value;
      return;
    }
  }
  current[last] = value;
}

// ── Stage execution functions ────────────────────────────────────────────────

interface RunContext {
  runId: string;
  topic: string;
  telemetry: TelemetryEmitter;
  config: Record<string, unknown>;
}

function getRunDir(runId: string): string {
  return join(DATA_DIR, "runs", runId);
}

function ensureDir(p: string): void {
  mkdirSync(p, { recursive: true });
}

/**
 * Write a manifest for the run.
 */
function writeManifest(ctx: RunContext, agentDef: AgentDef): void {
  const runDir = getRunDir(ctx.runId);
  ensureDir(runDir);
  const models = ctx.config.models as Record<string, unknown> | undefined;
  const modelUsed = models?.[agentDef.model] as Record<string, unknown> | undefined;
  const manifest = {
    runId: ctx.runId,
    topic: ctx.topic,
    startedAt: ctx.telemetry.getStartedAt(),
    params: { stage: agentDef.stage },
    models: modelUsed ? { [agentDef.model]: modelUsed } : {},
  };
  writeFileSync(join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}

async function stageResearch(ctx: RunContext): Promise<void> {
  const telemetry = ctx.telemetry;
  telemetry.stageStart("research");

  const agent = loadAgentByStage("research");
  const topicData = loadTopic(ctx.topic) as Record<string, unknown>;
  const title = (topicData.title as string) ?? ctx.topic;
  const keywords = (title.split(/\s+/)).slice(0, 5).join(", ");
  const articles = loadArticles();

  // Build prompt
  const systemPrompt = `${agent.body}

INSTRUCTIONS:
Respond with ONLY a JSON object in the following format (no markdown, no explanation):
{"articles":[{"publisher":"...","title":"...","description":"...","date":"YYYY-MM-DD","type":"ANALYSIS|REPORT|OPINION|FEATURE","url":"..."}]}

Topic: "${title}"
Keywords: ${keywords}
Date window: last 90 days`;

  const { provider, config: modelCfg } = getProviderForModel(agent.model);
  const modelName = modelCfg.model as string ?? agent.model;

  // Load publisher registry for accessPolicy resolution
  const registry = loadRegistry();
  const publisherMap = new Map<string, Record<string, unknown>>(
    registry.publishers.map((p) => [p.name, p]),
  );

  // Check budget before LLM call
  const budget = ctx.config.budget as Record<string, unknown> | undefined;
  const maxCost = (budget?.maxCostUsdPerRun as number) ?? Infinity;
  if (telemetry.costSoFar() >= maxCost) {
    telemetry.emit({ event: "budget", data: { spentUsd: telemetry.costSoFar(), limitUsd: maxCost, action: "halt" } });
    throw new GuardError(`Budget exceeded: $${telemetry.costSoFar()} >= $${maxCost}`);
  }

  let response: LlmCompleteResponse;
  try {
    response = await provider.complete({
      model: agent.model,
      system: systemPrompt,
      messages: [{ role: "user", content: `Research topic "${title}" and return articles.` }],
      temperature: (modelCfg.temperature as number) ?? 0.2,
    });
  } catch (err: unknown) {
    telemetry.emit({ event: "error", stage: "research", data: { message: (err as Error).message, recoverable: false } });
    throw err;
  }

  // Emit llm_call telemetry
  const rawData = response.raw as Record<string, unknown> | undefined;
  telemetry.llmCall({
    provider: modelCfg.provider as string ?? "openrouter",
    model: (rawData?.model as string) ?? modelName,
    tokensIn: response.usage.tokensIn,
    tokensOut: response.usage.tokensOut,
    costUsd: (rawData?.costUsd as number) ?? 0,
    latencyMs: (rawData?.latencyMs as number) ?? 0,
    attempt: (rawData?.attempt as number) ?? 1,
    stage: "research",
  });

  // Persist raw response
  const runDir = getRunDir(ctx.runId);
  ensureDir(join(runDir, "research"));
  writeFileSync(join(runDir, "research", "response.md"), response.text, "utf-8");

  // Extract JSON
  const jsonStr = extractJson(response.text);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    telemetry.emit({ event: "error", stage: "research", data: { message: "Failed to parse LLM response as JSON", recoverable: true } });
    writeFileSync(join(runDir, "research", "response.md"), response.text + "\n\n---\nPARSE ERROR: Invalid JSON", "utf-8");
    return;
  }

  const rawArticles = parsed.articles as Array<Record<string, unknown>> | undefined;
  if (!rawArticles || !Array.isArray(rawArticles)) {
    telemetry.emit({ event: "error", stage: "research", data: { message: "LLM response missing 'articles' array", recoverable: true } });
    return;
  }

  // Build valid articles with accessPolicy and metadata
  const validArticles: Array<Record<string, unknown>> = [];
  let nextSourceId = articles.articles.length + 1;

  for (const raw of rawArticles) {
    // Resolve accessPolicy
    const publisher = (raw.publisher as string) ?? "Unknown Publisher";
    const pubEntry = publisherMap.get(publisher);
    const policy = pubEntry
      ? { ...(pubEntry.policy as Record<string, unknown>) }
      : { access: "open", license: "unknown", reuse: "link_only", fullText: false, summary: true, link: true, pendingVerification: true };

    // Handle unknown publisher - add to registry ref for the tool call
    if (!pubEntry) {
      telemetry.toolCall({ tool: "registry-append", target: publisher, stage: "research" });
    }

    const sourceId = `source-${String(nextSourceId).padStart(3, "0")}`;
    nextSourceId++;

    const article: Record<string, unknown> = {
      id: sourceId,
      publisher,
      title: raw.title ?? "",
      description: (raw.description as string) ?? "",
      date: raw.date ?? new Date().toISOString().slice(0, 10),
      type: raw.type ?? "REPORT",
      url: raw.url ?? "",
      accessPolicy: policy,
      storyCluster: `cluster-${nextSourceId}`,
      originalReporting: false,
      stance: "neutral",
      perspectives: ["technology"],
    };

    // Validate against Source schema
    const result = Source.safeParse(article);
    if (result.success) {
      validArticles.push(article);
    } else {
      telemetry.emit({
        event: "error",
        stage: "research",
        data: { message: `Article validation failed: ${result.error.issues.map((i) => i.message).join("; ")}` },
      });
    }
  }

// Append articles via store (uses guards)
    const agentDef2 = loadAgentByStage("research");
    if (validArticles.length > 0) {
      appendArticles("articles/articles_cache.json", validArticles as Array<{ id: string } & Record<string, unknown>>, agentDef2.writeScope);
    telemetry.toolCall({ tool: "cache-append", count: validArticles.length, stage: "research" });
  }

  telemetry.stageEnd("research", { articlesAdded: validArticles.length });
}

async function stageAnalysis(ctx: RunContext, allowStale = false): Promise<void> {
  const telemetry = ctx.telemetry;
  telemetry.stageStart("analysis");

  const agent = loadAgentByStage("analysis");
  const topicData = loadTopic(ctx.topic) as Record<string, unknown>;
  const articles = loadArticles();

  // Stale-cache guard
  if (!allowStale) {
    const cacheMtime = getMtime("articles/articles_cache.json");
    if (cacheMtime) {
      const states = topicData.states as Array<Record<string, unknown>> | undefined;
      if (states && states.length > 0) {
        const lastPeriod = states[states.length - 1]?.period as string | undefined;
        if (lastPeriod) {
          // Derive period start: "YYYY-MM" -> first of that month
          const periodStart = new Date(`${lastPeriod}-01`);
          if (cacheMtime < periodStart) {
            telemetry.emit({
              event: "error",
              stage: "analysis",
              data: { message: `STALE CACHE: cache mtime ${cacheMtime.toISOString()} < period start ${periodStart.toISOString()}` },
            });
            telemetry.stageEnd("analysis", { staleCache: true });
            throw new GuardError(`STALE CACHE: articles_cache.json updated ${cacheMtime.toISOString()} before period ${lastPeriod}`);
          }
        }
      }
    }
  }

  // Build prompt
  const cacheExcerpt = JSON.stringify(articles).slice(0, 2000);
  const systemPrompt = `${agent.body}

INSTRUCTIONS:
Respond with ONLY a JSON object in the following format (no markdown, no explanation):
{"proposals":[{"id":"P-001","kind":"metrics|status|question|synthesis|perspective|narrative","path":"states.0.nodes.Technology.metrics","value":{...},"confidence":0.85,"evidence":"Based on X articles"}]}

Topic context: ${JSON.stringify(topicData).slice(0, 500)}
Articles cache excerpt: ${cacheExcerpt}`;

  const { provider, config: modelCfg } = getProviderForModel(agent.model);
  const modelName = modelCfg.model as string ?? agent.model;

  // Budget check
  const budget = ctx.config.budget as Record<string, unknown> | undefined;
  const maxCost = (budget?.maxCostUsdPerRun as number) ?? Infinity;
  if (telemetry.costSoFar() >= maxCost) {
    telemetry.emit({ event: "budget", data: { spentUsd: telemetry.costSoFar(), limitUsd: maxCost, action: "halt" } });
    throw new GuardError(`Budget exceeded: $${telemetry.costSoFar()} >= $${maxCost}`);
  }

  let response: LlmCompleteResponse;
  try {
    response = await provider.complete({
      model: agent.model,
      system: systemPrompt,
      messages: [{ role: "user", content: `Analyze topic "${ctx.topic}" and return proposals.` }],
      temperature: (modelCfg.temperature as number) ?? 0.3,
    });
  } catch (err: unknown) {
    telemetry.emit({ event: "error", stage: "analysis", data: { message: (err as Error).message, recoverable: false } });
    throw err;
  }

  const rawData = response.raw as Record<string, unknown> | undefined;
  telemetry.llmCall({
    provider: modelCfg.provider as string ?? "openrouter",
    model: (rawData?.model as string) ?? modelName,
    tokensIn: response.usage.tokensIn,
    tokensOut: response.usage.tokensOut,
    costUsd: (rawData?.costUsd as number) ?? 0,
    latencyMs: (rawData?.latencyMs as number) ?? 0,
    attempt: (rawData?.attempt as number) ?? 1,
    stage: "analysis",
  });

  // Persist
  const runDir = getRunDir(ctx.runId);
  ensureDir(join(runDir, "analysis"));
  writeFileSync(join(runDir, "analysis", "response.md"), response.text, "utf-8");

  // Extract and validate JSON
  const jsonStr = extractJson(response.text);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    telemetry.emit({ event: "error", stage: "analysis", data: { message: "Failed to parse LLM response as JSON", recoverable: true } });
    return;
  }

  const proposals = parsed.proposals as Array<Record<string, unknown>> | undefined;
  if (!proposals || !Array.isArray(proposals)) {
    telemetry.emit({ event: "error", stage: "analysis", data: { message: "LLM response missing 'proposals' array", recoverable: true } });
    return;
  }

  // Validate via ProposalSet
  const result = ProposalSet.safeParse({ proposals });
  if (!result.success) {
    telemetry.emit({
      event: "error",
      stage: "analysis",
      data: { message: `Proposal validation: ${result.error.issues.map((i) => i.message).join("; ")}` },
    });
    // Still persist but flag as invalid
  }

  // Persist validated proposal set
  writeFileSync(
    join(runDir, "analysis", "proposals.json"),
    JSON.stringify(result.success ? result.data : { proposals }, null, 2) + "\n",
    "utf-8",
  );

  telemetry.emit({ event: "proposal", stage: "analysis", data: { count: proposals.length } });
  telemetry.stageEnd("analysis", { proposalsCount: proposals.length });
}

async function stageWriting(ctx: RunContext): Promise<void> {
  const telemetry = ctx.telemetry;
  telemetry.stageStart("writing");

  const agent = loadAgentByStage("writing");
  const topicData = loadTopic(ctx.topic) as Record<string, unknown>;
  const runDir = getRunDir(ctx.runId);

  // Load analysis proposals
  let proposals: Array<Record<string, unknown>> = [];
  const proposalsPath = join(runDir, "analysis", "proposals.json");
  if (existsSync(proposalsPath)) {
    const parsed = JSON.parse(readFileSync(proposalsPath, "utf-8")) as Record<string, unknown>;
    proposals = (parsed.proposals as Array<Record<string, unknown>>) ?? [];
  }

  const systemPrompt = `${agent.body}

INSTRUCTIONS:
Respond with ONLY a JSON object in the following format (no markdown, no explanation):
{"narrative":[{"path":"perspectives.0.summary","value":"Updated summary text"},{"path":"states.0.question","value":"Updated question"}]}

Topic context: ${JSON.stringify(topicData).slice(0, 500)}
Proposals: ${JSON.stringify({ proposals }).slice(0, 2000)}`;

  const { provider, config: modelCfg } = getProviderForModel(agent.model);
  const modelName = modelCfg.model as string ?? agent.model;

  const budget = ctx.config.budget as Record<string, unknown> | undefined;
  const maxCost = (budget?.maxCostUsdPerRun as number) ?? Infinity;
  if (telemetry.costSoFar() >= maxCost) {
    telemetry.emit({ event: "budget", data: { spentUsd: telemetry.costSoFar(), limitUsd: maxCost, action: "halt" } });
    throw new GuardError(`Budget exceeded: $${telemetry.costSoFar()} >= $${maxCost}`);
  }

  let response: LlmCompleteResponse;
  try {
    response = await provider.complete({
      model: agent.model,
      system: systemPrompt,
      messages: [{ role: "user", content: `Write narrative for topic "${ctx.topic}".` }],
      temperature: (modelCfg.temperature as number) ?? 0.4,
    });
  } catch (err: unknown) {
    telemetry.emit({ event: "error", stage: "writing", data: { message: (err as Error).message, recoverable: false } });
    throw err;
  }

  const rawData = response.raw as Record<string, unknown> | undefined;
  telemetry.llmCall({
    provider: modelCfg.provider as string ?? "openrouter",
    model: (rawData?.model as string) ?? modelName,
    tokensIn: response.usage.tokensIn,
    tokensOut: response.usage.tokensOut,
    costUsd: (rawData?.costUsd as number) ?? 0,
    latencyMs: (rawData?.latencyMs as number) ?? 0,
    attempt: (rawData?.attempt as number) ?? 1,
    stage: "writing",
  });

  // Persist
  ensureDir(join(runDir, "writing"));
  writeFileSync(join(runDir, "writing", "response.md"), response.text, "utf-8");

  // Extract and validate JSON
  const jsonStr = extractJson(response.text);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    telemetry.emit({ event: "error", stage: "writing", data: { message: "Failed to parse LLM response as JSON", recoverable: true } });
    return;
  }

  const narrative = parsed.narrative as Array<Record<string, unknown>> | undefined;
  if (!narrative || !Array.isArray(narrative)) {
    telemetry.emit({ event: "error", stage: "writing", data: { message: "LLM response missing 'narrative' array", recoverable: true } });
    return;
  }

  // Fold narrative entries into the proposal set so the approval gate covers
  // ALL topic mutations — SPECv4 §7.1: nothing applies without approval.
  // Writing ids continue at P-101+ (analysis uses P-001..P-099).
  const NARRATIVE_ID_OFFSET = 100;
  const narrativeProposals = narrative.map((entry, i) => ({
    id: `P-${NARRATIVE_ID_OFFSET + 1 + i}`,
    kind: "narrative",
    path: entry.path as string,
    value: entry.value,
    confidence: 0.5,
    evidence: "Writing Assistant draft — text field merge.",
  }));
  mkdirSync(dirname(proposalsPath), { recursive: true });
  writeFileSync(
    proposalsPath,
    JSON.stringify({ proposals: [...proposals, ...narrativeProposals] }, null, 2) + "\n",
    "utf-8",
  );

  writeFileSync(
    join(runDir, "writing", "narrative.json"),
    JSON.stringify({ narrative }, null, 2) + "\n",
    "utf-8",
  );

  telemetry.stageEnd("writing", { narrativeEntries: narrative.length });
}

async function stageApply(ctx: RunContext): Promise<void> {
  const telemetry = ctx.telemetry;
  telemetry.stageStart("apply");

  const agent = loadAgentByStage("apply");
  const runDir = getRunDir(ctx.runId);
  const approvalsDir = join(DATA_DIR, "approvals");
  const approvalPath = join(approvalsDir, `${ctx.runId}.json`);

  // Approval gate
  if (!existsSync(approvalPath)) {
    telemetry.emit({ event: "error", stage: "apply", data: { message: "APPROVAL REQUIRED - no approval record found" } });
    telemetry.stageEnd("apply", { approved: false });
    throw new GuardError("APPROVAL REQUIRED: no approval record found at " + approvalPath);
  }

  const approvalRaw = JSON.parse(readFileSync(approvalPath, "utf-8"));
  const approvalResult = Approval.safeParse(approvalRaw);
  if (!approvalResult.success) {
    throw new GuardError(`Invalid approval record: ${approvalResult.error.message}`);
  }
  const approval = approvalResult.data;

  telemetry.emit({ event: "approval", stage: "apply", data: { decidedBy: approval.decidedBy, decisions: approval.decisions.length } });

  // Load proposals (narrative entries were folded in by the writing stage
  // and pass through the same approval gate — no separate narrative path)
  const proposalsPath = join(runDir, "analysis", "proposals.json");
  let proposals: Array<Record<string, unknown>> = [];
  if (existsSync(proposalsPath)) {
    const pData = JSON.parse(readFileSync(proposalsPath, "utf-8")) as Record<string, unknown>;
    proposals = (pData.proposals as Array<Record<string, unknown>>) ?? [];
  }

  // Build a map of approved decisions
  const decisionMap = new Map<string, typeof approval.decisions[0]>();
  for (const d of approval.decisions) {
    decisionMap.set(d.proposalId, d);
  }

  // Load topic
  const topic = loadTopic<Record<string, unknown>>(ctx.topic);

  // Backup
  telemetry.toolCall({ tool: "backup", target: ctx.topic, stage: "apply" });
  const backupPath = backupTopic(ctx.topic);
  telemetry.emit({ event: "apply", stage: "apply", data: { backupPath, approvedCount: 0, validationResult: "pending" } });

  // Merge approved proposals
  let appliedCount = 0;
  for (const proposal of proposals) {
    const pId = proposal.id as string;
    const decision = decisionMap.get(pId);
    if (!decision) continue;
    if (decision.decision === "reject") continue;

    const kind = proposal.kind as string;
    const path = proposal.path as string;

    // Only overwrite for certain kinds
    if (!["metrics", "status", "question", "synthesis", "narrative"].includes(kind)) continue;

    const value = decision.decision === "edit" && decision.editedPayload !== undefined
      ? decision.editedPayload
      : proposal.value;

    try {
      setByPath(topic, path, value);
      appliedCount++;
    } catch (err: unknown) {
      telemetry.emit({ event: "error", stage: "apply", data: { message: `Failed to set path "${path}": ${(err as Error).message}` } });
    }
  }

  // Re-validate
  const articles = loadArticles();
  const registry = loadRegistry();
  const manifest = loadManifest();

  const validationResult = await validateTopic({
    topic,
    articles: { articles: articles.articles as any },
    registry: { publishers: registry.publishers as any },
    manifest: manifest.topics ? { topics: manifest.topics.map((t) => ({ slug: t.slug, file: t.file })) } : undefined,
  });

  if (!validationResult.ok) {
    // Restore backup
    const topicPath = join(DATA_DIR, "topics", `${ctx.topic}.json`);
    writeFileSync(topicPath, readFileSync(backupPath, "utf-8"), "utf-8");
    telemetry.emit({
      event: "error",
      stage: "apply",
      data: { message: `Validation failed after merge: ${validationResult.checks.map((c) => c.details.join("; ")).join(" | ")}`, restored: true },
    });
    telemetry.stageEnd("apply", { approved: false, restored: true });
    throw new GuardError(`Validation failed after apply — backup restored from ${backupPath}`);
  }

  // Write updated topic
  writeJson(`topics/${ctx.topic}.json`, topic, agent.writeScope);
  telemetry.toolCall({ tool: "store-write", target: `topics/${ctx.topic}.json`, stage: "apply" });

  telemetry.stageEnd("apply", {
    approved: true,
    appliedCount,
    backupPath,
    validationResult: "pass",
  });
}

async function stageValidate(ctx: RunContext): Promise<void> {
  const telemetry = ctx.telemetry;
  telemetry.stageStart("validate");

  const topic = loadTopic<Record<string, unknown>>(ctx.topic);
  const articles = loadArticles();
  const registry = loadRegistry();
  const manifest = loadManifest();

  const result = await validateTopic({
    topic,
    articles: { articles: articles.articles as any },
    registry: { publishers: registry.publishers as any },
    manifest: manifest.topics ? { topics: manifest.topics.map((t) => ({ slug: t.slug, file: t.file })) } : undefined,
  });

  telemetry.emit({
    event: "validation",
    stage: "validate",
    data: { ok: result.ok, checks: result.checks.length, failures: result.checks.filter((c) => c.status === "fail").length },
  });

  telemetry.stageEnd("validate", { ok: result.ok });

  if (!result.ok) {
    process.exit(1);
  }
}

async function stagePublish(ctx: RunContext): Promise<void> {
  const telemetry = ctx.telemetry;
  telemetry.stageStart("publish");

  try {
    const html = generateHtmlFromFile(ctx.topic, ROOT);
    const distDir = join(ROOT, "dist");
    ensureDir(distDir);
    writeFileSync(join(distDir, "index.html"), html, "utf-8");
    telemetry.stageEnd("publish", { path: "dist/index.html" });
  } catch (err: unknown) {
    telemetry.emit({ event: "error", stage: "publish", data: { message: (err as Error).message, recoverable: false } });
    throw err;
  }
}

// ── Replay / Rerun ───────────────────────────────────────────────────────────

async function cmdReplay(runId: string): Promise<void> {
  const runDir = join(DATA_DIR, "runs", runId);
  if (!existsSync(runDir)) {
    console.error(`Run directory not found: ${runDir}`);
    process.exit(1);
  }

  const proposalsPath = join(runDir, "analysis", "proposals.json");
  if (existsSync(proposalsPath)) {
    const proposals = JSON.parse(readFileSync(proposalsPath, "utf-8")) as Record<string, unknown>;
    console.log(JSON.stringify(proposals, null, 2));
  } else {
    console.log("No proposals found in run", runId);
  }

  // Print manifest summary
  const manifestPath = join(runDir, "manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
    console.log("\n--- Manifest ---");
    console.log(`Run: ${manifest.runId}`);
    console.log(`Topic: ${manifest.topic}`);
    console.log(`Started: ${manifest.startedAt}`);
  }
}

async function cmdRerun(runId: string, fromStage: string, ctx: RunContext): Promise<void> {
  // Verify run exists
  const runDir = join(DATA_DIR, "runs", runId);
  if (!existsSync(runDir)) {
    console.error(`Run directory not found: ${runDir}`);
    process.exit(1);
  }

  // Load existing manifest
  const manifestPath = join(runDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(`Manifest not found in run: ${runDir}`);
    process.exit(1);
  }

  ctx.telemetry.emit({ event: "run_start", data: { rerun: true, from: fromStage } });

  const stages = ["research", "analysis", "writing", "apply", "validate", "publish"];
  const startIdx = stages.indexOf(fromStage);
  if (startIdx === -1) {
    console.error(`Unknown stage: ${fromStage}`);
    process.exit(1);
  }

  const stageMap: Record<string, (ctx: RunContext) => Promise<void>> = {
    research: stageResearch,
    analysis: (c) => stageAnalysis(c, true),  // allow stale in reruns
    writing: stageWriting,
    apply: stageApply,
    validate: stageValidate,
    publish: stagePublish,
  };

  for (let i = startIdx; i < stages.length; i++) {
    const stage = stages[i]!;
    const fn = stageMap[stage];
    if (!fn) continue;
    await fn(ctx);
  }

  ctx.telemetry.runEnd();
}

// ── Report ───────────────────────────────────────────────────────────────────

async function cmdReport(runId?: string): Promise<void> {
  if (!runId) {
    // Find last run from summary
    const summaryPath = join(DATA_DIR, "telemetry", "summary.jsonl");
    if (!existsSync(summaryPath)) {
      console.log("No telemetry summary found.");
      return;
    }
    const lines = readFileSync(summaryPath, "utf-8").trim().split("\n").filter(Boolean);
    if (lines.length === 0) {
      console.log("No runs recorded in summary.");
      return;
    }
    const lastLine = lines[lines.length - 1]!;
    console.log(JSON.stringify(JSON.parse(lastLine), null, 2));
    return;
  }

  const runDir = join(DATA_DIR, "runs", runId);
  if (!existsSync(runDir)) {
    console.error(`Run not found: ${runId}`);
    process.exit(1);
  }

  const manifestPath = join(runDir, "manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    console.log("=== Manifest ===");
    console.log(JSON.stringify(manifest, null, 2));
  }

  const telemetryPath = join(runDir, "telemetry.jsonl");
  if (existsSync(telemetryPath)) {
    const lines = readFileSync(telemetryPath, "utf-8").trim().split("\n").filter(Boolean);
    console.log(`\n=== Telemetry (${lines.length} events) ===`);
    for (const line of lines) {
      const ev = JSON.parse(line);
      console.log(`[${ev.ts}] ${ev.event}${ev.stage ? ` (${ev.stage})` : ""}${ev.data ? " " + JSON.stringify(ev.data) : ""}`);
    }
  }
}

// ── Approve ──────────────────────────────────────────────────────────────────

async function cmdApprove(runId: string, decisionsPath?: string): Promise<void> {
  let decisions: Array<Record<string, unknown>>;

  if (decisionsPath) {
    const content = JSON.parse(readFileSync(decisionsPath, "utf-8"));
    decisions = (content.decisions ?? content) as Array<Record<string, unknown>>;
  } else {
    // Interactive mode - read from stdin
    const chunks: string[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk.toString());
    }
    decisions = JSON.parse(chunks.join("")).decisions as Array<Record<string, unknown>>;
  }

  const approval = {
    run: runId,
    decidedBy: "human-editor",
    decidedAt: new Date().toISOString(),
    decisions,
  };

  const result = Approval.safeParse(approval);
  if (!result.success) {
    console.error("Invalid approval:", result.error.issues);
    process.exit(1);
  }

  const approvalsDir = join(DATA_DIR, "approvals");
  ensureDir(approvalsDir);
  writeFileSync(join(approvalsDir, `${runId}.json`), JSON.stringify(result.data, null, 2) + "\n", "utf-8");
  console.log(`Approval written: data/approvals/${runId}.json`);
}

// ── Main CLI ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse commands
  const params: Record<string, string> = {};
  const flags: string[] = [];

  for (const arg of args) {
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        params[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        flags.push(arg.slice(2));
      }
    } else if (arg.includes("=")) {
      const eqIdx = arg.indexOf("=");
      params[arg.slice(0, eqIdx)] = arg.slice(eqIdx + 1);
    } else {
      flags.push(arg);
    }
  }

  const stage = params.stage;
  const workflow = params.workflow;
  const topic = params.topic;
  const runId = params.run ?? randomUUID();
  const fromStage = params.from;
  const decisionsPath = params.decisions;
  const allowStale = flags.includes("allow-stale");

  // ── replay command ─────────────────────────────────────────────────────
  if (flags.includes("run") && args.includes("replay")) {
    await cmdReplay(params.run!);
    return;
  }

  // ── rerun command ──────────────────────────────────────────────────────
  if (flags.includes("run") && args.includes("rerun")) {
    if (!fromStage) {
      console.error("rerun requires --from <stage>");
      process.exit(2);
    }
    const config = loadConfig();
    const telemetry = new TelemetryEmitter(params.run!, topic ?? "unknown");
    const ctx: RunContext = { runId: params.run!, topic: topic ?? "unknown", telemetry, config };
    await cmdRerun(params.run!, fromStage, ctx);
    return;
  }

  // ── approve command ────────────────────────────────────────────────────
  if (args.includes("approve")) {
    await cmdApprove(params.run!, decisionsPath);
    return;
  }

  // ── report command ─────────────────────────────────────────────────────
  if (args.includes("report")) {
    await cmdReport(params.run);
    return;
  }

  // ── workflow command ───────────────────────────────────────────────────
  if (workflow) {
    if (!topic) {
      console.error("workflow requires topic=<slug>");
      process.exit(2);
    }

    const config = loadConfig();
    const telemetry = new TelemetryEmitter(runId, topic);
    const ctx: RunContext = { runId, topic, telemetry, config };

    telemetry.emit({ event: "run_start", data: { workflow } });

    // Write initial manifest
    const agentDef = loadAgentByStage("research");
    writeManifest(ctx, agentDef);

    // Run research -> analysis -> writing
    await stageResearch(ctx);
    await stageAnalysis(ctx, allowStale);
    await stageWriting(ctx);

    telemetry.runEnd();
    return;
  }

  // ── stage command ──────────────────────────────────────────────────────
  if (stage) {
    if (!topic) {
      console.error("stage requires topic=<slug>");
      process.exit(2);
    }

    const config = loadConfig();
    const telemetry = new TelemetryEmitter(runId, topic);
    const ctx: RunContext = { runId, topic, telemetry, config };

    telemetry.emit({ event: "run_start", data: { stage } });

    // Write initial manifest
    try {
      const agentDef = loadAgentByStage(stage);
      writeManifest(ctx, agentDef);
    } catch {
      // validate and publish don't have agent files, write generic manifest
      const runDir = getRunDir(runId);
      ensureDir(runDir);
      writeFileSync(
        join(runDir, "manifest.json"),
        JSON.stringify({ runId, topic, startedAt: telemetry.getStartedAt(), params: { stage } }, null, 2) + "\n",
        "utf-8",
      );
    }

    const stageMap: Record<string, (ctx: RunContext) => Promise<void>> = {
      research: stageResearch,
      analysis: (c) => stageAnalysis(c, allowStale),
      writing: stageWriting,
      apply: stageApply,
      validate: stageValidate,
      publish: stagePublish,
    };

    const fn = stageMap[stage];
    if (!fn) {
      console.error(`Unknown stage: "${stage}"`);
      process.exit(2);
    }

    try {
      await fn(ctx);
    } catch (err: unknown) {
      if (err instanceof GuardError) {
        console.error(err.message);
        process.exit(1);
      }
      throw err;
    }

    telemetry.runEnd();
    return;
  }

  // No recognized command
  console.error(`Usage:
  npm run pipeline -- stage=<research|analysis|writing|apply|validate|publish> topic=<slug> [run=<id>]
  npm run pipeline -- workflow=period-update topic=<slug> [--allow-stale]
  npm run pipeline -- replay --run <id>
  npm run pipeline -- rerun --run <id> --from <stage>
  npm run pipeline -- approve --run <id> [--decisions <file.json>]
  npm run pipeline -- report [--run <id> | --last]`);
  process.exit(2);
}

// ── Entry point ──────────────────────────────────────────────────────────────

export {
  RunContext, stageResearch, stageAnalysis, stageWriting, stageApply, stageValidate, stagePublish,
  cmdReplay, cmdRerun, cmdReport, cmdApprove, getByPath, setByPath,
};

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("runner.ts");
if (isMain) {
  main().catch((err) => {
    console.error("FATAL:", err);
    process.exit(2);
  });
}