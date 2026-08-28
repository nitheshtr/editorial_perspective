/**
 * pipeline/src/providers/types.ts — LlmProvider interface per §7.1
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompleteRequest {
  model: string;
  system?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** "off" disables reasoning tokens (hybrid models like GLM-5.3-flash starve
   * content otherwise on complex tasks); "low" reduces reasoning effort. */
  reasoning?: "off" | "low";
}

export interface LlmCompleteResponse {
  text: string;
  usage: { tokensIn: number; tokensOut: number };
  raw: unknown;
}

export interface LlmProvider {
  complete(req: LlmCompleteRequest): Promise<LlmCompleteResponse>;
}

export type FetchImpl = typeof globalThis.fetch;

export interface ProviderConstructorOpts {
  apiKey?: string;
  fetchImpl?: FetchImpl;
}

/** Extract JSON from a raw LLM response string (strip ```json fences). */
export function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1]!.trim();
  return trimmed;
}