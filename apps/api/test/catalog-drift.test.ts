import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_TOOL_NAMES,
  GATEWAY_MCP_URL,
  GATEWAY_SITE_URL,
  PROVIDER_CATALOG,
  PROVIDER_COUNT,
  TOTAL_GATEWAY_TOOL_COUNT,
  TOTAL_PROVIDER_TOOL_COUNT,
  providersForSuite,
} from "@waqf/types";
import { UPSTREAM_PROVIDERS } from "../src/config/providers.config";
import { SchemaNormalizer } from "../src/core/normalizer";
import { LLMS_FULL_TXT, LLMS_TXT } from "../src/llms";
import { ROBOTS_TXT } from "../src/robots";
import { SITEMAP_XML } from "../src/sitemap";

/**
 * The provider catalog, the API provider config, the landing page and the two
 * published llms artifacts are separate copies of the same facts. These tests
 * fail as soon as one of them drifts, which is what happened to the Bahouth tool
 * list before the catalog existed.
 */

const publicLlmsTxt = readFileSync(new URL("../../web/public/llms.txt", import.meta.url), "utf8").replace(/\r\n?/g, "\n");
const publicLlmsFullTxt = readFileSync(new URL("../../web/public/llms-full.txt", import.meta.url), "utf8").replace(/\r\n?/g, "\n");

const enabledProviders = PROVIDER_CATALOG.filter((entry) => entry.enabled);

describe("Provider catalog consistency", () => {
  it("derives the API provider config from the catalog", () => {
    expect(UPSTREAM_PROVIDERS.map((provider) => provider.id)).toEqual(
      enabledProviders.map((entry) => entry.id)
    );

    for (const entry of enabledProviders) {
      const provider = UPSTREAM_PROVIDERS.find((candidate) => candidate.id === entry.id);
      expect(provider).toBeDefined();
      expect(provider?.baseUrl).toBe(entry.upstreamUrl);
      expect(provider?.transport).toBe(entry.upstreamTransport);
      expect(provider?.name).toBe(entry.displayName);
      expect(provider?.description).toBe(entry.summary);
      expect(provider?.cacheTtlSeconds).toBe(entry.cacheTtlSeconds);
    }
  });

  it("keeps the published counts honest", () => {
    expect(PROVIDER_COUNT).toBe(PROVIDER_CATALOG.length);
    expect(TOTAL_PROVIDER_TOOL_COUNT).toBe(
      PROVIDER_CATALOG.reduce((total, entry) => total + entry.tools.length, 0)
    );
    expect(TOTAL_GATEWAY_TOOL_COUNT).toBe(TOTAL_PROVIDER_TOOL_COUNT + CANONICAL_TOOL_NAMES.length);
  });

  it("exposes Aljam3 in the heritage suite", () => {
    expect(providersForSuite("turath").map((entry) => entry.id)).toContain("aljam3");
    expect(providersForSuite("quran").map((entry) => entry.id)).not.toContain("aljam3");
  });

  it("binds the catalog's canonical names to the normalizer's real definitions", () => {
    // Without this, adding a 7th canonical tool to the normalizer alone would
    // leave every published artifact claiming 51 tools with all tests green.
    const defined = new SchemaNormalizer().getCanonicalToolDefinitions().map((tool) => tool.name);
    expect(defined).toEqual([...CANONICAL_TOOL_NAMES]);
  });
});

describe("llms artifacts match the catalog", () => {
  it("serves exactly the public llms files", () => {
    expect(LLMS_TXT).toBe(publicLlmsTxt);
    expect(LLMS_FULL_TXT).toBe(publicLlmsFullTxt);
  });

  it("names every federated provider", () => {
    for (const entry of PROVIDER_CATALOG) {
      expect(LLMS_TXT).toContain(`(\`${entry.id}\`)`);
      expect(LLMS_FULL_TXT).toContain(`(\`${entry.id}__*\`)`);
    }
  });

  it("documents every namespaced provider tool", () => {
    for (const entry of PROVIDER_CATALOG) {
      for (const tool of entry.tools) {
        expect(LLMS_FULL_TXT).toContain(`${entry.id}__${tool}`);
      }
    }
  });

  it("documents every canonical tool", () => {
    for (const tool of CANONICAL_TOOL_NAMES) {
      expect(LLMS_TXT).toContain(`\`${tool}\``);
      expect(LLMS_FULL_TXT).toContain(`\`${tool}\``);
    }
  });

  it("publishes the current federation totals", () => {
    expect(LLMS_TXT).toContain(`all ${TOTAL_GATEWAY_TOOL_COUNT} tools across all ${PROVIDER_COUNT} providers.`);
    expect(LLMS_FULL_TXT).toContain(
      `all ${TOTAL_GATEWAY_TOOL_COUNT} tools across all ${PROVIDER_COUNT} federated providers.`
    );
    expect(LLMS_FULL_TXT).toContain("the Aljam3 books corpus");
  });
});

describe("published host split", () => {
  const publicServerCard = readFileSync(
    new URL("../../web/public/.well-known/mcp/server-card.json", import.meta.url),
    "utf8"
  );
  const publicAuthMd = readFileSync(new URL("../../web/public/auth.md", import.meta.url), "utf8");
  const publicAiCatalog = readFileSync(
    new URL("../../web/public/.well-known/ai-catalog.json", import.meta.url),
    "utf8"
  );

  it("sends agents to the protocol host and readers to the site host", () => {
    expect(GATEWAY_MCP_URL).toBe("https://mcp.waqf.app/mcp");
    expect(GATEWAY_SITE_URL).toBe("https://mcp.waqf.dev");
  });

  it("never publishes the human-facing host as the MCP endpoint", () => {
    // mcp.waqf.dev sits behind a bot challenge, so an endpoint URL on that host
    // would hand agents an address they cannot use.
    for (const artifact of [LLMS_TXT, LLMS_FULL_TXT, publicServerCard, publicAuthMd, publicAiCatalog]) {
      expect(artifact).not.toContain(`${GATEWAY_SITE_URL}/mcp`);
    }
  });

  it("publishes the protocol endpoint in every agent artifact", () => {
    for (const artifact of [LLMS_TXT, LLMS_FULL_TXT, publicServerCard]) {
      expect(artifact).toContain(GATEWAY_MCP_URL);
    }
    // auth.md documents the endpoint as a Host header plus path, not an absolute URL.
    expect(publicAuthMd).toContain(`Host: ${new URL(GATEWAY_MCP_URL).host}`);
  });
});

describe("published file mirrors", () => {
  const publicSitemap = readFileSync(new URL("../../web/public/sitemap.xml", import.meta.url), "utf8");
  const publicRobots = readFileSync(new URL("../../web/public/robots.txt", import.meta.url), "utf8");

  it("keeps the served sitemap byte-identical to the published file", () => {
    expect(SITEMAP_XML).toBe(publicSitemap);
  });

  it("keeps the served robots.txt byte-identical to the published file", () => {
    expect(ROBOTS_TXT).toBe(publicRobots);
  });

  it("never advertises the absent /ar/ URL", () => {
    // Arabic is served at the root; a sitemap entry for /ar/ points crawlers at a 404.
    expect(SITEMAP_XML).not.toContain("/ar/");
  });
});
