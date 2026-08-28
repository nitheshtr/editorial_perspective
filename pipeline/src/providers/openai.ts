/**
 * pipeline/src/providers/openai.ts — OpenAI provider adapter
 *
 * POST https://api.openai.com/v1/chat/completions
 * Authorization: Bearer <OPENAI_API_KEY>
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

export class OpenAIProvider implements LlmProvider {
  private apiKey: string;
  private fetchImpl: FetchImpl;
  private baseUrl = "https://api.openai.com/v1";
  private retryCfg?: { maxAttempts: number; backoffMs: number };

  constructor(opts?: { apiKey?: string; fetchImpl?: FetchImpl; retry?: { maxAttempts: number; backoffMs: number } }) {
    this.apiKey = opts?.apiKey ?? process.env.OPENAI_API_KEY ?? "";
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

    const system = req.system;
    const messages: ChatMessage[] = system
      ? [{ role: "system", content: system }, ...req.messages]
      : [...req.messages];
    const model = req.model.replace(/^models\./, "");

    const models = [model, ...failoverModels];

    const apiKey = this.apiKey;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    for (const m of models) {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const startTime = Date.now();
          const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: m,
              messages,
              temperature: req.temperature ?? 0.3,
              max_tokens: maxTokens,
            }),
            signal: controller.signal,
          });
          clearTimeout(timer);

          if (response.ok) {
            const raw = (await response.json()) as Record<string, unknown>;
            const choice = (raw.choices as Array<Record<string, unknown>>)?.[0];
            const text = ((choice?.message as Record<string, unknown>)?.content as string) ?? "";
            const usageRaw = raw.usage as Record<string, unknown> | undefined;
            const tokensIn = (usageRaw?.prompt_tokens as number) ?? 0;
            const tokensOut = (usageRaw?.completion_tokens as number) ?? 0;
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

          const body = await response.text().catch(() => "");
          throw new Error(`OpenAI HTTP ${response.status}: ${body}`);
        } catch (err: unknown) {
          clearTimeout(timer);
          if (err instanceof Error && err.name === "AbortError") {
            if (attempt < maxAttempts) {
              const delay = backoffMs * 2 ** (attempt - 1);
              await new Promise((r) => setTimeout(r, delay));
              continue;
            }
            throw new Error(`OpenAI timeout after ${maxAttempts} attempts (model: ${m})`);
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

    throw new Error(`OpenAI: all models exhausted for ${req.model}`);
  }
}