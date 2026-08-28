/**
 * pipeline/src/providers/anthropic.ts — Anthropic provider adapter
 *
 * POST https://api.anthropic.com/v1/messages
 * Headers: x-api-key + anthropic-version: 2023-06-01
 * system param separate from messages.
 */

import { type LlmProvider, type LlmCompleteRequest, type LlmCompleteResponse, type FetchImpl, type ChatMessage } from "./types.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");

function loadConfig() {
  return JSON.parse(readFileSync(join(ROOT, "config", "pipeline.json"), "utf-8"));
}

export class AnthropicProvider implements LlmProvider {
  private apiKey: string;
  private fetchImpl: FetchImpl;
  private baseUrl = "https://api.anthropic.com/v1";
  private retryCfg?: { maxAttempts: number; backoffMs: number };

  constructor(opts?: { apiKey?: string; fetchImpl?: FetchImpl; retry?: { maxAttempts: number; backoffMs: number } }) {
    this.apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    this.fetchImpl = opts?.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.retryCfg = opts?.retry;
  }

  async complete(req: LlmCompleteRequest): Promise<LlmCompleteResponse> {
    const config = loadConfig();
    const defaults = config.defaults ?? {};
    const retryCfg = config.retry ?? { maxAttempts: 3, backoffMs: 2000 };
    const failoverModels: string[] = config.failover?.[req.model] ?? [];
    const modelEntry = config.models?.[req.model];
    const pricePerMTokensIn = modelEntry?.pricePerMTokensIn ?? 0;
    const pricePerMTokensOut = modelEntry?.pricePerMTokensOut ?? 0;

    const maxAttempts = this.retryCfg?.maxAttempts ?? retryCfg.maxAttempts ?? 3;
    const backoffMs = this.retryCfg?.backoffMs ?? retryCfg.backoffMs ?? 2000;
    const timeoutMs = defaults.timeoutMs ?? 120000;
    const maxTokens = req.maxTokens ?? defaults.maxTokens ?? 4096;

    const model = req.model.replace(/^models\./, "");
    const models = [model, ...failoverModels];

    const apiKey = this.apiKey;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    for (const m of models) {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const startTime = Date.now();
          const bodyObj: Record<string, unknown> = {
            model: m,
            messages: req.messages.map((msg) => ({ role: msg.role, content: msg.content })),
            max_tokens: maxTokens,
            temperature: req.temperature ?? 0.3,
          };
          if (req.system) {
            bodyObj.system = req.system;
          }

          const response = await this.fetchImpl(`${this.baseUrl}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify(bodyObj),
            signal: controller.signal,
          });
          clearTimeout(timer);

          if (response.ok) {
            const raw = (await response.json()) as Record<string, unknown>;
            const content = raw.content as Array<Record<string, unknown>> | undefined;
            const text = (content?.[0]?.text as string) ?? "";
            const usageRaw = raw.usage as Record<string, unknown> | undefined;
            const tokensIn = (usageRaw?.input_tokens as number) ?? 0;
            const tokensOut = (usageRaw?.output_tokens as number) ?? 0;
            const latencyMs = Date.now() - startTime;
            const costUsd = (tokensIn / 1_000_000) * pricePerMTokensIn + (tokensOut / 1_000_000) * pricePerMTokensOut;

            return { text, usage: { tokensIn, tokensOut }, raw: { ...raw, attempt, costUsd, latencyMs, model: m } };
          }

          if (response.status === 429 || response.status >= 500) {
            if (attempt < maxAttempts) {
              const delay = backoffMs * 2 ** (attempt - 1);
              await new Promise((r) => setTimeout(r, delay));
              continue;
            }
            break;
          }

          const bodyText = await response.text().catch(() => "");
          throw new Error(`Anthropic HTTP ${response.status}: ${bodyText}`);
        } catch (err: unknown) {
          clearTimeout(timer);
          if (err instanceof Error && err.name === "AbortError") {
            if (attempt < maxAttempts) {
              const delay = backoffMs * 2 ** (attempt - 1);
              await new Promise((r) => setTimeout(r, delay));
              continue;
            }
            throw new Error(`Anthropic timeout after ${maxAttempts} attempts (model: ${m})`);
          }
          if (attempt < maxAttempts) {
            const delay = backoffMs * 2 ** (attempt - 1);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          throw err;
        }
      }
    }

    throw new Error(`Anthropic: all models exhausted for ${req.model}`);
  }
}