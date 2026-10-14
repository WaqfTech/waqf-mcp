#!/usr/bin/env node
/**
 * Regenerates apps/api/src/llms.ts from the public llms artifacts.
 *
 * The Worker serves /llms.txt and /llms-full.txt from these constants, while the
 * web app serves the same files as static assets from apps/web/public/. Editing
 * both by hand drifts; this script makes the public files the single source.
 *
 * Usage: node scripts/generate-llms-constants.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(root, "apps/web/public");
const target = resolve(root, "apps/api/src/llms.ts");

/** Escapes text for a double-quoted JS string literal. */
const ESCAPES = new Map([
  ["\\", "\\\\"],
  ['"', '\\"'],
  ["\n", "\\n"],
  ["&", "\\u0026"],
  ["<", "\\u003c"],
  [">", "\\u003e"],
]);

function escapeForStringLiteral(text) {
  let escaped = "";
  for (const char of text.replace(/\r\n?/g, "\n")) {
    escaped += ESCAPES.get(char) ?? char;
  }
  return escaped;
}

function readPublic(name) {
  return readFileSync(resolve(publicDir, name), "utf8");
}

const llmsTxt = readPublic("llms.txt");
const llmsFullTxt = readPublic("llms-full.txt");

const contents = `// Generated from apps/web/public/llms.txt and apps/web/public/llms-full.txt.
// Regenerate with: node scripts/generate-llms-constants.mjs
export const LLMS_TXT = "${escapeForStringLiteral(llmsTxt)}";

export const LLMS_FULL_TXT = "${escapeForStringLiteral(llmsFullTxt)}";
`;

writeFileSync(target, contents);
console.log(
  `Regenerated apps/api/src/llms.ts (${llmsTxt.length} chars, ${llmsFullTxt.length} chars)`
);
