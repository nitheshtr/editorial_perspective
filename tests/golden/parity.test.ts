import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { generateHtmlFromFile } from "../../tools/generate-site.js";

const GOLDEN = "tests/golden/ai-superrace.html";

describe("golden parity (Visual Fidelity Lock)", () => {
  it("generated output is byte-identical to the V3 golden file", () => {
    const out = generateHtmlFromFile("ai-superrace");
    expect(out.length).toBeGreaterThan(10000);
    if (!existsSync(GOLDEN)) {
      writeFileSync(GOLDEN, out); // auto-capture on first run
      return;
    }
    const golden = readFileSync(GOLDEN, "utf8");
    if (out !== golden) {
      const n = Math.min(out.length, golden.length);
      let i = 0;
      while (i < n && out[i] === golden[i]) i++;
      const from = Math.max(0, i - 80);
      const ctx = (s: string) => JSON.stringify(s.slice(from, i + 80)).slice(1, -1);
      throw new Error(
        `PARITY DRIFT at byte ${i} (golden ${golden.length}B vs generated ${out.length}B)\n` +
          `golden:    ...${ctx(golden)}...\ngenerated: ...${ctx(out)}...`,
      );
    }
    expect(out).toBe(golden);
  });
});
