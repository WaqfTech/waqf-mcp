import { describe, expect, it, vi } from "vitest";
import { D1CacheService } from "../src/services/cache";
import { D1TelemetryService } from "../src/services/telemetry";

/**
 * A missing local schema used to degrade silently: cache lookups kept missing,
 * telemetry rows kept disappearing, and nothing said why. These assertions pin
 * the actionable, rate-limited warning that replaced it.
 */

describe("D1 failure diagnostics", () => {
  it("warns once per isolate with the fix instead of staying silent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const cache = new D1CacheService({} as D1Database);
    await cache.get("missing-key");
    await cache.set("missing-key", "provider", "tool", { content: [{ type: "text", text: "x" }] });
    await cache.get("another-key");

    const telemetry = new D1TelemetryService({} as D1Database);
    await telemetry.log({ id: "1" } as never);
    await telemetry.log({ id: "2" } as never);

    const messages = warn.mock.calls.map((call) => String(call[0]));
    const actionable = messages.filter((message) => message.includes("aube run db:migrate:local"));

    expect(actionable).toHaveLength(2);
    expect(actionable.some((message) => message.startsWith("[cache]"))).toBe(true);
    expect(actionable.some((message) => message.startsWith("[telemetry]"))).toBe(true);

    warn.mockRestore();
  });
});
