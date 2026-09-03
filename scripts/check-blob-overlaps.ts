/**
 * check-blob-overlaps — numeric audit of the blob layout after the emitter's
 * resolution pass. Verifies, for EVERY state of EVERY topic:
 *   1. no blob-blob rect overlap larger than 0.5% of the map axis
 *   2. no blob rect intrudes into the central-topic-circle keep-out ellipse
 * Mobile override rects are audited against the mobile center geometry.
 * Usage: bun scripts/check-blob-overlaps.ts
 */
import { readFileSync } from "node:fs";
import { resolveBlobOverlaps, CENTER_GEOMETRY } from "../tools/generate-site.js";

interface Box { name: string; x: number; y: number; w: number; h: number }

const EPS = 0.5;

function nearestInside(box: Box, c: { cx: number; cy: number; rx: number; ry: number }, margin: number): boolean {
  const nx = Math.max(box.x, Math.min(c.cx, box.x + box.w));
  const ny = Math.max(box.y, Math.min(c.cy, box.y + box.h));
  const ex = (nx - c.cx) / (c.rx + margin);
  const ey = (ny - c.cy) / (c.ry + margin);
  return ex * ex + ey * ey < 1;
}

function overlaps(a: Box, b: Box): string | null {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ox > EPS && oy > EPS) return `${ox.toFixed(1)}x${oy.toFixed(1)}%`;
  return null;
}

let failures = 0;
const slugs = JSON.parse(readFileSync("data/topics/index.json", "utf8")).topics.map((t: { slug: string }) => t.slug);

for (const slug of slugs) {
  const topic = JSON.parse(readFileSync(`data/topics/${slug}.json`, "utf8"));
  const names = topic.perspectives.map((p: { name: string }) => p.name);
  topic.states.forEach((state: { label: string; nodes: Record<string, any> }, si: number) => {
    const clone = JSON.parse(JSON.stringify(state));
    resolveBlobOverlaps(clone, names);

    const desktop: Box[] = names.map((n: string) => ({
      name: n,
      x: clone.nodes[n].position.x,
      y: clone.nodes[n].position.y,
      w: Math.max(clone.nodes[n].size.w, 30),
      h: Math.max(clone.nodes[n].size.h, 28),
    }));
    for (let i = 0; i < desktop.length; i++) {
      for (let j = i + 1; j < desktop.length; j++) {
        const r = overlaps(desktop[i], desktop[j]);
        if (r) { console.log(`FAIL ${slug} [${state.label}] desktop: ${desktop[i].name} ∩ ${desktop[j].name} = ${r}`); failures++; }
      }
      if (nearestInside(desktop[i], CENTER_GEOMETRY.desktop, EPS)) {
        console.log(`FAIL ${slug} [${state.label}] desktop: ${desktop[i].name} intrudes into center circle`);
        failures++;
      }
    }

    const mobile: Box[] = names
      .filter((n: string) => clone.nodes[n].mobile)
      .map((n: string) => {
        const m = clone.nodes[n].mobile;
        return { name: n, x: m.x, y: m.y, w: m.w, h: m.h };
      });
    for (let i = 0; i < mobile.length; i++) {
      for (let j = i + 1; j < mobile.length; j++) {
        const r = overlaps(mobile[i], mobile[j]);
        if (r) { console.log(`FAIL ${slug} [${state.label}] mobile: ${mobile[i].name} ∩ ${mobile[j].name} = ${r}`); failures++; }
      }
      if (nearestInside(mobile[i], CENTER_GEOMETRY.mobile, EPS)) {
        console.log(`FAIL ${slug} [${state.label}] mobile: ${mobile[i].name} intrudes into center circle`);
        failures++;
      }
    }
  });
}

console.log(failures === 0 ? "ALL CLEAR — no blob overlaps or center intrusions across all topics/states" : `${failures} violation(s)`);
process.exit(failures === 0 ? 0 : 1);
