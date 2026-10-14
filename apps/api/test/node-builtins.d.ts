/**
 * Vitest runs in Node, while apps/api is deliberately typed for the Workers
 * runtime only (no Node or DOM libraries). The catalog drift test needs the
 * filesystem and a module URL, so declare exactly those two facts here.
 *
 * Remove this file if @types/node is ever added to apps/api.
 */

declare module "node:fs" {
  export function readFileSync(path: string | URL, encoding: "utf8"): string;
}

interface ImportMeta {
  url: string;
}
