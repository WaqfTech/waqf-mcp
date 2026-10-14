import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: cloudflare({
    imageService: "cloudflare",
  }),
  vite: {
    resolve: {
      alias: {
        // The workspace package ships raw TypeScript, so point Vite at its entry.
        "@waqf/types": fileURLToPath(new URL("../../packages/types/src/index.ts", import.meta.url)),
      },
    },
  },
  i18n: {
    defaultLocale: "ar",
    locales: ["ar", "en", "tr", "id", "ms"],
    routing: {
      prefixDefault: false,
    },
  },
});
