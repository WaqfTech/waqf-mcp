import type {
  GatewayErrorCode,
  IMcpProvider,
  ProviderConfig,
  ToolDefinition,
  ToolResult,
  TransportProtocol,
} from "@waqf/types";

/**
 * Service bindings registered per provider id. A provider whose service lives in
 * this same Cloudflare account is better reached over the internal network than
 * through the public edge, which re-enters the zone and is subject to its rules —
 * the gateway received HTTP 522 that way while the same request succeeded from a
 * normal network. Absent a binding, providers keep using the public fetch.
 */
const requestFetchers = new Map<string, Fetcher>();

interface CircuitState {
  consecutiveFailures: number;
  openUntilMs: number;
}

const circuitStates = new Map<string, CircuitState>();
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 15_000;
const MAX_RETRY_AFTER_MS = 2_000;

export class GatewayUpstreamError extends Error {
  constructor(
    public readonly code: GatewayErrorCode,
    public readonly source: string,
    public readonly retryable: boolean,
    message: string
  ) {
    super(message);
    this.name = "GatewayUpstreamError";
  }
}

export function classifyHttpStatus(status: number): { code: GatewayErrorCode; retryable: boolean } {
  if (status === 400 || status === 422) return { code: "INVALID_ARGUMENT", retryable: false };
  if (status === 401) return { code: "UNAUTHORISED", retryable: false };
  if (status === 403) return { code: "FORBIDDEN", retryable: false };
  if (status === 404) return { code: "SOURCE_NOT_FOUND", retryable: false };
  if (status === 429) return { code: "RATE_LIMITED", retryable: true };
  if (status === 408 || status === 504) return { code: "UPSTREAM_TIMEOUT", retryable: true };
  if (status >= 500) return { code: "SOURCE_UNAVAILABLE", retryable: true };
  return { code: "INTERNAL_ERROR", retryable: false };
}

export function classifyThrownError(providerId: string, err: unknown): {
  code: GatewayErrorCode;
  retryable: boolean;
  message: string;
} {
  if (err instanceof GatewayUpstreamError) {
    return { code: err.code, retryable: err.retryable, message: err.message };
  }
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  if (name === "AbortError" || /timeout|aborted/i.test(message)) {
    return { code: "UPSTREAM_TIMEOUT", retryable: true, message };
  }
  return { code: "SOURCE_UNAVAILABLE", retryable: true, message: `[${providerId}] ${message}` };
}

export function resetCircuitBreakers(): void {
  circuitStates.clear();
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const seconds = Number(headerValue.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_AFTER_MS, Math.round(seconds * 1000));
  }
  return null;
}

export function setRequestFetcher(providerId: string, fetcher: Fetcher): void {
  requestFetchers.set(providerId, fetcher);
}

export function clearRequestFetchers(): void {
  requestFetchers.clear();
}

export abstract class BaseMcpAdapter implements IMcpProvider {
  public readonly id: string;
  public readonly name: string;
  public readonly baseUrl: string;
  public readonly description: string;
  public readonly transport: TransportProtocol;
  public readonly cacheTtlSeconds?: number;
  protected readonly timeoutMs: number;
  protected readonly defaultHeaders: Record<string, string>;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    // Normalize baseUrl: preserve protocol and path, strip trailing slash for consistent joining
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.description = config.description;
    this.transport = config.transport;
    this.cacheTtlSeconds = config.cacheTtlSeconds;
    this.timeoutMs = config.timeoutMs ?? 8000;
    this.defaultHeaders = {
      "Content-Type": "application/json",
      "User-Agent": "WaqfMCP-Gateway/1.0 (+https://mcp.waqf.dev)",
      "X-Waqf-Federated-By": "mcp.waqf.dev",
      ...(config.headers ?? {}),
    };
  }

  abstract listTools(): Promise<ToolDefinition[]>;
  abstract callTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;

  async listResources(): Promise<import("@waqf/types").ResourceDefinition[]> {
    return [];
  }

  async readResource(_uri: string): Promise<import("@waqf/types").ReadResourceResult> {
    throw new Error(`[${this.id}] readResource not supported`);
  }

  async listPrompts(): Promise<import("@waqf/types").PromptDefinition[]> {
    return [];
  }

  async getPrompt(_promptName: string, _args?: Record<string, string>): Promise<import("@waqf/types").GetPromptResult> {
    throw new Error(`[${this.id}] getPrompt not supported`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const tools = await this.listTools();
      return Array.isArray(tools) && tools.length > 0;
    } catch {
      return false;
    }
  }

  private isCircuitOpen(nowMs: number): boolean {
    const state = circuitStates.get(this.id);
    if (!state) return false;
    return state.openUntilMs > nowMs;
  }

  private recordSuccess(): void {
    circuitStates.delete(this.id);
  }

  private recordFailure(nowMs: number): void {
    const current = circuitStates.get(this.id) ?? { consecutiveFailures: 0, openUntilMs: 0 };
    const nextFailures = current.consecutiveFailures + 1;
    circuitStates.set(this.id, {
      consecutiveFailures: nextFailures,
      openUntilMs: nextFailures >= CIRCUIT_FAILURE_THRESHOLD ? nowMs + CIRCUIT_COOLDOWN_MS : 0,
    });
  }

  private async runSingleFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const request = { ...init, signal: controller.signal };
    const bound = requestFetchers.get(this.id);

    try {
      return bound ? await bound.fetch(url, request) : await fetch(url, request);
    } finally {
      clearTimeout(timer);
    }
  }

  protected async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs = this.timeoutMs,
    maxRetries = 1
  ): Promise<Response> {
    const now = Date.now();
    if (this.isCircuitOpen(now)) {
      throw new GatewayUpstreamError(
        "SOURCE_UNAVAILABLE",
        this.id,
        true,
        `[${this.id}] Upstream circuit breaker is temporarily open; retry shortly.`
      );
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await this.runSingleFetch(url, init, timeoutMs);
        if (res.ok || res.status === 307 || res.status === 308) {
          this.recordSuccess();
          return res;
        }

        const classification = classifyHttpStatus(res.status);
        if (!classification.retryable || attempt === maxRetries) {
          if (classification.retryable) {
            this.recordFailure(Date.now());
          }
          return res;
        }

        const retryAfterMs = parseRetryAfterMs(res.headers?.get?.("Retry-After") ?? null);
        const jitterMs = Math.floor(Math.random() * 40) + 10;
        const delayMs = retryAfterMs ?? 50 + jitterMs;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } catch (err) {
        lastError = err;
        const classified = classifyThrownError(this.id, err);
        if (!classified.retryable || attempt === maxRetries) {
          this.recordFailure(Date.now());
          throw new GatewayUpstreamError(
            classified.code,
            this.id,
            classified.retryable,
            classified.message
          );
        }
        const jitterMs = Math.floor(Math.random() * 40) + 10;
        await new Promise((resolve) => setTimeout(resolve, 50 + jitterMs));
      }
    }

    this.recordFailure(Date.now());
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
