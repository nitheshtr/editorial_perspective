/**
 * pipeline/src/telemetry.ts — TelemetryEmitter class
 *
 * Emits zod-validated TelemetryEvent lines to data/runs/{runId}/telemetry.jsonl
 * and aggregates per-run totals to data/telemetry/summary.jsonl on run end.
 *
 * ADR-003: structured, append-only JSONL event stream.
 */

import { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TelemetryEvent, type TelemetryEventT } from "../../schema/src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const DATA_DIR = join(ROOT, "data");

export interface StageTotals {
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  llmCalls: number;
  toolCalls: number;
  retries: number;
}

export interface SummaryLine {
  run: string;
  topic: string;
  startedAt: string;
  finishedAt: string;
  totals: Record<string, StageTotals>;
}

export class TelemetryEmitter {
  private runId: string;
  private topic: string;
  private startedAt: string;
  private finishedAt?: string;
  private perStage: Map<string, StageTotals> = new Map();
  private currentStage?: string;
  private streamPath: string;
  private summaryPath: string;

  constructor(runId: string, topic: string) {
    this.runId = runId;
    this.topic = topic;
    this.startedAt = new Date().toISOString();

    const dir = join(DATA_DIR, "runs", runId);
    mkdirSync(dir, { recursive: true });

    this.streamPath = join(dir, "telemetry.jsonl");
    this.summaryPath = join(DATA_DIR, "telemetry", "summary.jsonl");

    // Ensure telemetry dir exists
    mkdirSync(join(DATA_DIR, "telemetry"), { recursive: true });
  }

  /** Get per-stage totals, initializing if needed. */
  private getStage(stage: string): StageTotals {
    let s = this.perStage.get(stage);
    if (!s) {
      s = { tokensIn: 0, tokensOut: 0, costUsd: 0, llmCalls: 0, toolCalls: 0, retries: 0 };
      this.perStage.set(stage, s);
    }
    return s;
  }

  /** Write a zod-validated event to the JSONL stream. */
  private writeEvent(event: TelemetryEventT): void {
    const line = JSON.stringify(event) + "\n";
    appendFileSync(this.streamPath, line, "utf-8");
  }

  /** Emit a fully custom event. Fields are validated against TelemetryEvent schema. */
  emit(fields: {
    event: TelemetryEventT["event"];
    level?: TelemetryEventT["level"];
    stage?: string;
    agent?: string;
    data?: Record<string, unknown>;
  }): void {
    const parsed = TelemetryEvent.parse({
      ts: new Date().toISOString(),
      run: this.runId,
      level: fields.level ?? "info",
      event: fields.event,
      stage: fields.stage,
      agent: fields.agent,
      data: fields.data ?? {},
    });
    this.writeEvent(parsed);
  }

  /** Emit a stage_start event. */
  stageStart(stage: string): void {
    this.currentStage = stage;
    this.emit({ event: "stage_start", stage });
  }

  /** Emit a stage_end event. */
  stageEnd(stage: string, data?: Record<string, unknown>): void {
    this.emit({ event: "stage_end", stage, data });
    this.currentStage = undefined;
  }

  /** Record an LLM call with cost tracking. */
  llmCall(params: {
    provider: string;
    model: string;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    latencyMs: number;
    attempt: number;
    stage?: string;
  }): void {
    const stage = params.stage ?? this.currentStage ?? "unknown";
    const s = this.getStage(stage);
    s.tokensIn += params.tokensIn;
    s.tokensOut += params.tokensOut;
    s.costUsd += params.costUsd;
    s.llmCalls += 1;
    if (params.attempt > 1) s.retries += params.attempt - 1;

    this.emit({
      event: "llm_call",
      stage,
      data: {
        provider: params.provider,
        model: params.model,
        tokensIn: params.tokensIn,
        tokensOut: params.tokensOut,
        costUsd: params.costUsd,
        latencyMs: params.latencyMs,
        attempt: params.attempt,
      },
    });
  }

  /** Record a tool call. */
  toolCall(params: { tool: string; target?: string; count?: number; stage?: string }): void {
    const stage = params.stage ?? this.currentStage ?? "unknown";
    const s = this.getStage(stage);
    s.toolCalls += 1;

    this.emit({
      event: "tool_call",
      stage,
      data: { tool: params.tool, target: params.target, count: params.count ?? 1 },
    });
  }

  /** Return total cost so far across all stages. */
  costSoFar(): number {
    let total = 0;
    for (const s of this.perStage.values()) {
      total += s.costUsd;
    }
    return total;
  }

  /** End the run, write summary, and append to cross-run summary. */
  runEnd(): void {
    this.finishedAt = new Date().toISOString();
    this.emit({ event: "run_end", data: { finishedAt: this.finishedAt } });

    // Append to summary
    const totals: Record<string, StageTotals> = {};
    for (const [stage, t] of this.perStage.entries()) {
      totals[stage] = { ...t };
    }

    const summaryLine = JSON.stringify({
      run: this.runId,
      topic: this.topic,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      totals,
    } satisfies SummaryLine) + "\n";

    mkdirSync(dirname(this.summaryPath), { recursive: true });
    appendFileSync(this.summaryPath, summaryLine, "utf-8");
  }

  /** Get the stream path (useful for tests). */
  getStreamPath(): string {
    return this.streamPath;
  }

  /** Get the run started timestamp. */
  getStartedAt(): string {
    return this.startedAt;
  }
}