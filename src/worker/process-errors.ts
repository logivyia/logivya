type ClassifiedWorkerProcessError = {
  recoverable: boolean;
  code: string;
  name: string;
};

const RECOVERABLE_ERROR_PATTERNS: Array<[code: string, pattern: RegExp]> = [
  ["PRISMA_CONNECTION_UNAVAILABLE", /\bP1001\b|can't reach database server|database server.*unreachable/i],
  ["PRISMA_OPERATION_TIMEOUT", /\bP1008\b|operations timed out/i],
  ["PRISMA_CONNECTION_POOL_TIMEOUT", /\bP2024\b|connection pool|timed out fetching a new connection/i],
  ["PRISMA_TRANSACTION_TIMEOUT", /\bP2028\b|transaction.*(?:closed|timeout|expired)/i],
  ["NETWORK_TIMEOUT", /ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|AbortError|TimeoutError|timed out/i],
  ["NETWORK_CONNECTION_RESET", /ECONNRESET|ECONNREFUSED|EPIPE|socket hang up/i],
  ["REDIS_TRANSIENT", /max requests limit exceeded|Connection is closed|Redis.*(?:timeout|connect)/i],
  ["WHATSAPP_TRANSIENT", /WHATSAPP_(?:TRANSIENT_DISCONNECT|RECONNECT_REQUIRED|RESTORING_CONNECTION|RETRYING_CONNECTION|SESSION_CONNECTION_TIMEOUT|PAIRING_IN_PROGRESS)|Connection Closed|restart required|WebSocket.*closed/i],
];

function workerProcessErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function classifyWorkerProcessError(error: unknown): ClassifiedWorkerProcessError {
  const message = workerProcessErrorMessage(error);
  const explicitCode = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
  const matched = RECOVERABLE_ERROR_PATTERNS.find(([, pattern]) => pattern.test(`${explicitCode ?? ""} ${message}`));
  return {
    recoverable: Boolean(matched),
    code: matched?.[0] ?? explicitCode?.slice(0, 80) ?? "UNKNOWN_UNHANDLED_REJECTION",
    name: error instanceof Error ? error.name.slice(0, 80) : typeof error,
  };
}
