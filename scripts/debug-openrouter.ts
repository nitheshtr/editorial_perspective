const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
  },
  body: JSON.stringify({
    model: "z-ai/glm-5.3-flash",
    max_tokens: 512,
    messages: [{ role: "user", content: 'Return ONLY this JSON object: {"ok":true,"n":42}' }],
  }),
});
const j: any = await r.json();
const m = j.choices?.[0]?.message ?? {};
console.log("HTTP", r.status, "| finish:", j.choices?.[0]?.finish_reason, "| usage:", JSON.stringify(j.usage));
console.log("msg keys:", Object.keys(m).join(","));
console.log("content:", JSON.stringify(String(m.content ?? "").slice(0, 200)));
console.log("reasoning:", JSON.stringify(String(m.reasoning ?? "").slice(0, 200)));
