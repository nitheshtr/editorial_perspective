// Probe The Conversation's feeds page for real feed URLs + test candidate feed URLs.
const r = await fetch("https://theconversation.com/us/feeds", {
  headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
});
const t = await r.text();
console.log(`feeds page: HTTP ${r.status} (${t.length} bytes)`);
const links = Array.from(t.matchAll(/href="([^"]+)"/gi))
  .map((m) => m[1])
  .filter((u) => /rss|feed|\.xml/i.test(u));
console.log("feed links found:");
console.log([...new Set(links)].slice(0, 15).join("\n"));

// Probe the other candidate URLs directly
const probes: Record<string, string> = {
  conv_rss: "https://theconversation.com/us/rss",
  brookings_webfeed: "https://webfeeds.brookings.edu/brookingsrss/topfeeds",
  cfr_rss: "https://www.cfr.org/rss.xml",
};
for (const [k, u] of Object.entries(probes)) {
  try {
    const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
    const body = await r.text();
    const isXml = body.trimStart().startsWith("<?xml");
    console.log(`\n${k}: HTTP ${r.status} | ${body.length}B | ${isXml ? "XML OK" : body.slice(0, 60).replace(/\s+/g, " ")}`);
  } catch (e) {
    console.log(`${k}: ERR ${(e as Error).message.slice(0, 60)}`);
  }
}
