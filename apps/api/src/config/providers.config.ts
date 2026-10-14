import { PROVIDER_CATALOG } from "@waqf/types";
import type { ProviderConfig } from "@waqf/types";

/**
 * Upstream MCP servers the gateway federates.
 *
 * Derived from PROVIDER_CATALOG in @waqf/types so the gateway, the landing page
 * and the published llms artifacts cannot drift apart. To federate a new server,
 * add it to that catalog (and use scripts/probe-provider.mjs to capture its real
 * tools/list surface first).
 */
export const UPSTREAM_PROVIDERS: ProviderConfig[] = PROVIDER_CATALOG.filter(
  (entry) => entry.enabled
).map((entry) => ({
  id: entry.id,
  name: entry.displayName,
  baseUrl: entry.upstreamUrl,
  transport: entry.upstreamTransport,
  description: entry.summary,
  timeoutMs: entry.timeoutMs,
  cacheTtlSeconds: entry.cacheTtlSeconds,
  enabled: entry.enabled,
}));
