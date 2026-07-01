#!/usr/bin/env node
/**
 * Golden-rule enforcement: the deterministic engine must contain no LLM calls
 * and no network access. Legal determinations are pure functions over
 * reference data. This script fails CI if packages/engine ever imports an
 * LLM SDK, the extraction package, or an HTTP client.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE_DIR = fileURLToPath(new URL("../packages/engine/src", import.meta.url));
const ROOT = fileURLToPath(new URL("..", import.meta.url));

const FORBIDDEN = [
  { pattern: /from\s+["'](@anthropic-ai\/[^"']*|openai|@openai\/[^"']*)["']/, why: "LLM SDK import" },
  { pattern: /require\(\s*["'](@anthropic-ai\/[^"']*|openai)["']\s*\)/, why: "LLM SDK require" },
  { pattern: /from\s+["']@veritariff\/extraction["']/, why: "extraction (LLM) package import" },
  { pattern: /from\s+["'](axios|undici|node-fetch|got)["']/, why: "HTTP client import" },
  { pattern: /from\s+["']node:https?["']/, why: "raw HTTP import" },
  { pattern: /\bfetch\s*\(/, why: "network call (fetch)" },
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) yield p;
  }
}

const violations = [];
for (const file of walk(ENGINE_DIR)) {
  const src = readFileSync(file, "utf8");
  src.split("\n").forEach((line, i) => {
    for (const { pattern, why } of FORBIDDEN) {
      if (pattern.test(line)) {
        violations.push(`${relative(ROOT, file)}:${i + 1}  [${why}]  ${line.trim()}`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error("ENGINE BOUNDARY VIOLATION — the deterministic engine must stay pure:\n");
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}
console.log("engine boundary OK: no LLM or network imports in packages/engine");
