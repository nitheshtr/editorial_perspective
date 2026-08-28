import { OpenRouterProvider } from "../pipeline/src/providers/openrouter.js";

const provider = new OpenRouterProvider();
const res = await provider.complete({
  model: "z-ai/glm-5.3-flash",
  messages: [{ role: "user", content: "Reply with exactly: PIPELINE-OK" }],
  maxTokens: 16,
});
console.log("reply:", JSON.stringify(res.text.trim().slice(0, 60)));
console.log("usage:", JSON.stringify(res.usage));
console.log("PROVIDER VERIFIED");
