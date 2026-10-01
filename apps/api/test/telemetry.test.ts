import { describe, it, expect } from "vitest";
import { D1TelemetryService } from "../src/services/telemetry";

describe("D1TelemetryService", () => {
  const fakeD1 = {} as D1Database;
  const telemetry = new D1TelemetryService(fakeD1);

  it("hashes IP addresses using salt and SHA-256", async () => {
    const hash1 = await telemetry.hashIp("192.168.1.1");
    const hash2 = await telemetry.hashIp("192.168.1.1");
    const hash3 = await telemetry.hashIp("10.0.0.1");

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1).toHaveLength(64);
  });

  it("detects known AI and IDE clients from user-agent", () => {
    expect(telemetry.detectClientApp("Claude/1.0 (Anthropic)")).toBe("claude");
    expect(telemetry.detectClientApp("Cursor/0.45.0")).toBe("cursor");
    expect(telemetry.detectClientApp("Antigravity-Agent/2.0")).toBe("antigravity");
    expect(telemetry.detectClientApp("Cline/3.5")).toBe("cline");
    expect(telemetry.detectClientApp("curl/8.5.0")).toBe("curl");
    expect(telemetry.detectClientApp("Mozilla/5.0 Chrome/120.0")).toBe("other");
    expect(telemetry.detectClientApp(null)).toBe("unknown");
  });
});
