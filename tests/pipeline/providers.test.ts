/**
 * tests/pipeline/providers.test.ts
 *
 * Provider adapter tests: mocked fetchImpl, success parsing, retry, failover,
 * and missing-key errors.
 */

import { describe, it, expect, vi } from "vitest";
import { OpenRouterProvider } from "../../pipeline/src/providers/openrouter.js";
import { AnthropicProvider } from "../../pipeline/src/providers/anthropic.js";
import { OpenAIProvider } from "../../pipeline/src/providers/openai.js";
import { extractJson } from "../../pipeline/src/providers/types.js";

// ── Mock helpers ─────────────────────────────────────────────────────────────

function mockFetch(successBody: unknown, status = 200) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => successBody,
    text: async () => JSON.stringify(successBody),
  })) as unknown as typeof globalThis.fetch;
}

describe("extractJson", () => {
  it("extracts from fenced code block", () => {
    const text = "```json\n{\"key\": \"value\"}\n```";
    expect(extractJson(text)).toBe('{"key": "value"}');
  });

  it("extracts from bare JSON", () => {
    expect(extractJson('{"key": "value"}')).toBe('{"key": "value"}');
  });

  it("extracts from markdown with trailing text", () => {
    const text = '```\n{"key": "value"}\n```\nSome notes.';
    expect(extractJson(text)).toBe('{"key": "value"}');
  });
});

describe("OpenRouterProvider", () => {
  it("parses a successful response", async () => {
    const fetchImpl = mockFetch({
      choices: [{ message: { content: "Hello world" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const provider = new OpenRouterProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.complete({
      model: "models.research",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.text).toBe("Hello world");
    expect(result.usage.tokensIn).toBe(10);
    expect(result.usage.tokensOut).toBe(5);
    expect(result.raw).toBeDefined();
  });

  it("retries on 500 then succeeds", async () => {
    let callCount = 0;
    const fetchImpl = vi.fn(async () => {
      callCount++;
      if (callCount < 3) {
        return { ok: false, status: 500, statusText: "Error", json: async () => ({}), text: async () => "{}" } as unknown as Response;
      }
      return {
        ok: true, status: 200, statusText: "OK",
        json: async () => ({ choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
        text: async () => "",
      } as unknown as Response;
    });

    const provider = new OpenRouterProvider({ apiKey: "test-key", fetchImpl, retry: { maxAttempts: 3, backoffMs: 1 } });
    const result = await provider.complete({
      model: "models.research",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.text).toBe("OK");
    expect(callCount).toBe(3);
  });

  it("throws on persistent failure after retries", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false, status: 500, statusText: "Error",
      json: async () => ({}), text: async () => "{}",
    })) as unknown as typeof globalThis.fetch;

    const provider = new OpenRouterProvider({ apiKey: "test-key", fetchImpl, retry: { maxAttempts: 3, backoffMs: 1 } });
    await expect(
      provider.complete({ model: "models.research", messages: [{ role: "user", content: "Hello" }] })
    ).rejects.toThrow();
  });

  it("fails with clear error when no API key", async () => {
    // Temporarily clear env
    const origKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "";

    const provider = new OpenRouterProvider();
    await expect(
      provider.complete({ model: "models.research", messages: [{ role: "user", content: "Hello" }] })
    ).rejects.toThrow("OPENROUTER_API_KEY");

    process.env.OPENROUTER_API_KEY = origKey;
  });
});

describe("AnthropicProvider", () => {
  it("handles system message and parses response", async () => {
    const fetchImpl = mockFetch({
      content: [{ text: "Hello from Claude" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const provider = new AnthropicProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.complete({
      model: "models.analysis",
      system: "You are helpful",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.text).toBe("Hello from Claude");
    expect(result.usage.tokensIn).toBe(10);
    expect(result.usage.tokensOut).toBe(5);
  });

  it("retries on 429 and succeeds", async () => {
    let callCount = 0;
    const fetchImpl = vi.fn(async () => {
      callCount++;
      if (callCount < 2) {
        return { ok: false, status: 429, statusText: "Too Many Requests", json: async () => ({}), text: async () => "{}" } as unknown as Response;
      }
      return {
        ok: true, status: 200, statusText: "OK",
        json: async () => ({ content: [{ text: "OK" }], usage: { input_tokens: 1, output_tokens: 1 } }),
        text: async () => "",
      } as unknown as Response;
    });

    const provider = new AnthropicProvider({ apiKey: "test-key", fetchImpl, retry: { maxAttempts: 3, backoffMs: 1 } });
    const result = await provider.complete({
      model: "models.analysis",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.text).toBe("OK");
    expect(callCount).toBe(2);
  }, 10000);

  it("fails with clear error when no API key", async () => {
    const origKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "";

    const provider = new AnthropicProvider();
    await expect(
      provider.complete({ model: "models.analysis", messages: [{ role: "user", content: "Hello" }] })
    ).rejects.toThrow("ANTHROPIC_API_KEY");

    process.env.ANTHROPIC_API_KEY = origKey;
  });
});

describe("OpenAIProvider", () => {
  it("parses a successful response", async () => {
    const fetchImpl = mockFetch({
      choices: [{ message: { content: "Hello from GPT" } }],
      usage: { prompt_tokens: 15, completion_tokens: 8 },
    });

    const provider = new OpenAIProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.complete({
      model: "models.writing",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.text).toBe("Hello from GPT");
    expect(result.usage.tokensIn).toBe(15);
    expect(result.usage.tokensOut).toBe(8);
  });
});