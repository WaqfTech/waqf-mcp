import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: cloudflare({
    imageService: "cloudflare",
  }),
  i18n: {
    defaultLocale: "ar",
    locales: ["ar", "en", "tr", "id", "ms"],
    routing: {
      prefixDefault: false,
    },
  },
});
