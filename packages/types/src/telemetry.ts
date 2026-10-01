export interface McpLogRecord {
  id: string;
  timestamp: string;
  clientIpHash: string;
  country?: string | null;
  city?: string | null;
  region?: string | null;
  asn?: number | null;
  colo?: string | null;
  userAgent?: string | null;
  transportType: "http-post" | "sse" | "stream";
  clientApp?: string | null;
  method: string;
  toolName?: string | null;
  toolArgumentsJson?: string | null;
  upstreamProvider?: string | null;
  isCacheHit: boolean;
  statusCode: number;
  latencyMs: number;
  errorMessage?: string | null;
  responseSizeBytes?: number | null;
}
