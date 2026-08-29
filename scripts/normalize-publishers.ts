/**
 * S5 — publisher-name normalization: fix auto-derived names from unscoped
 * research runs (domain-titlecased) to proper publisher names. Applies to
 * the article cache and the publisher registry (rename in place, no dupes).
 */
import { readFileSync, writeFileSync } from "node:fs";

const FIX: Record<string, string> = {
  "Ibm": "IBM",
  "Neuberger": "Neuberger Berman",
  "Gradientflow": "Gradient Flow",
  "Nebius": "Nebius AI",
};

const cache = JSON.parse(readFileSync("data/articles/articles_cache.json", "utf8"));
let fixedCache = 0;
for (const a of cache.articles as Array<any>) {
  if (FIX[a.publisher]) {
    a.publisher = FIX[a.publisher];
    fixedCache++;
  }
}
writeFileSync("data/articles/articles_cache.json", `${JSON.stringify(cache, null, 2)}\n`);

const reg = JSON.parse(readFileSync("data/config/publishers.json", "utf8"));
let renamed = 0;
for (const p of reg.publishers as Array<any>) {
  if (FIX[p.name]) {
    const target = FIX[p.name];
    const existing = reg.publishers.find((x: any) => x !== p && x.name === target);
    if (existing) {
      // Merge: keep the verified/older entry, drop the duplicate
      reg.publishers = reg.publishers.filter((x: any) => x !== p);
      console.log(`merged duplicate registry entry into ${target}`);
    } else {
      p.name = target;
    }
    renamed++;
  }
}
writeFileSync("data/config/publishers.json", `${JSON.stringify(reg, null, 2)}\n`);
console.log(`S5 done: ${fixedCache} article publisher names normalized | ${renamed} registry entries renamed/merged | registry ${reg.publishers.length}`);