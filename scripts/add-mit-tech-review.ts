import { readFileSync, writeFileSync } from "node:fs";

const reg = JSON.parse(readFileSync("data/config/publishers.json", "utf8"));

if (reg.publishers.some((p: any) => p.name === "MIT Technology Review")) {
  console.log("exists: MIT Technology Review");
} else {
  reg.publishers.push({
    name: "MIT Technology Review",
    tier: 2,
    policy: {
      access: "metered", license: "copyright", reuse: "link_only",
      fullText: false, summary: true, link: true, pendingVerification: false,
    },
    notes:
      "VERIFIED 2026-08-28 via technologyreview.com/terms-of-service + /republishing/: all rights reserved; no open license; reuse only via paid syndication/single-use licensing (licensing@technologyreview.com, Copyright Clearance Center). Link + summarize only. Metered access — paywalled pages auto-skipped by research.",
  });
  writeFileSync("data/config/publishers.json", `${JSON.stringify(reg, null, 2)}\n`);
  console.log(`added: MIT Technology Review | total: ${reg.publishers.length}`);
}