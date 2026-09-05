export const HEALTH_STATES = ["HEALTHY", "DEGRADED", "UNAVAILABLE", "UNKNOWN", "MAINTENANCE"] as const;

export type HealthState = (typeof HEALTH_STATES)[number];
export type ServiceTier = 0 | 1 | 2;
export type HealthTrend = "IMPROVING" | "STABLE" | "WORSENING" | "UNKNOWN";

export type HealthMetricValue = string | number | boolean | null;

export type ServiceHealth = {
  id: string;
  name: string;
  state: HealthState;
  tier: ServiceTier;
  summary: string;
  checkedAt: string;
  lastSuccessfulCheckAt: string | null;
  lastFailureAt: string | null;
  latencyMs: number | null;
  trend: HealthTrend;
  release: string | null;
  safeErrorCode: string | null;
  runbook: string | null;
  incidentId: string | null;
  metrics: Record<string, HealthMetricValue>;
};

export type QueueOperationalMetrics = {
  name: string;
  state: HealthState;
  counts: Record<string, number>;
  oldestWaitingAgeMs: number | null;
  completedLast15m: number;
  failedLast15m: number;
  retrying: number;
  throughputPerMinute: number;
  averageProcessingMs: number | null;
  p95ProcessingMs: number | null;
  p99ProcessingMs: number | null;
  completionRate: number | null;
  workerCount: number | null;
  checkedAt: string;
  stale: boolean;
  safeErrorCode: string | null;
};

export type WorkerHeartbeat = {
  workerId: string;
  service: string;
  environment: string;
  release: string | null;
  queueNames: string[];
  startedAt: string;
  lastHeartbeatAt: string;
  currentJobs: number;
  capacity: number;
  status: "HEALTHY" | "BUSY" | "DEGRADED" | "DRAINING" | "STOPPED" | "UNKNOWN";
  sourceCommit: string | null;
};

export type SystemHealthSnapshot = {
  status: HealthState;
  service: string;
  environment: string;
  release: string | null;
  generatedAt: string;
  staleAfterMs: number;
  services: ServiceHealth[];
  queues: QueueOperationalMetrics[];
  incidents: Array<Record<string, unknown>>;
  alerts: Array<Record<string, unknown>>;
  capacityWarnings: Array<{ code: string; severity: "MEDIUM" | "HIGH" | "CRITICAL"; message: string; service: string }>;
};

const STATE_WEIGHT: Record<HealthState, number> = {
  HEALTHY: 0,
  MAINTENANCE: 1,
  UNKNOWN: 2,
  DEGRADED: 3,
  UNAVAILABLE: 4,
};

export function aggregateHealthState(services: Array<Pick<ServiceHealth, "state" | "tier">>): HealthState {
  const tierZero = services.filter((service) => service.tier === 0);
  if (tierZero.some((service) => service.state === "UNAVAILABLE")) return "UNAVAILABLE";
  if (tierZero.some((service) => ["DEGRADED", "UNKNOWN", "MAINTENANCE"].includes(service.state))) return "DEGRADED";
  if (services.some((service) => service.state === "UNAVAILABLE" || service.state === "DEGRADED")) return "DEGRADED";
  if (services.some((service) => service.state === "UNKNOWN")) return "UNKNOWN";
  if (services.length > 0 && services.every((service) => service.state === "MAINTENANCE")) return "MAINTENANCE";
  return "HEALTHY";
}

export function worstHealthState(states: HealthState[]): HealthState {
  return states.reduce<HealthState>((worst, state) => STATE_WEIGHT[state] > STATE_WEIGHT[worst] ? state : worst, "HEALTHY");
}

export function evaluateLatency(latencyMs: number, degradedAfterMs: number, unavailableAfterMs: number): HealthState {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) return "UNKNOWN";
  if (latencyMs >= unavailableAfterMs) return "UNAVAILABLE";
  if (latencyMs >= degradedAfterMs) return "DEGRADED";
  return "HEALTHY";
}

export function evaluateWorkerHeartbeat(
  heartbeat: Pick<WorkerHeartbeat, "lastHeartbeatAt" | "status"> | null,
  now = Date.now(),
  freshMs = 60_000,
): HealthState {
  if (!heartbeat) return "UNKNOWN";
  const age = now - new Date(heartbeat.lastHeartbeatAt).getTime();
  if (!Number.isFinite(age)) return "UNKNOWN";
  if (heartbeat.status === "STOPPED") return "UNAVAILABLE";
  if (age > freshMs * 2) return "UNAVAILABLE";
  if (age > freshMs || heartbeat.status === "DEGRADED" || heartbeat.status === "DRAINING") return "DEGRADED";
  return "HEALTHY";
}

export function evaluateDeploymentReleaseEvidence(
  apiRelease: string | null | undefined,
  workerRelease: string | null | undefined,
): HealthState {
  // Web and background workers are deployed independently. Different release
  // labels are therefore evidence of component-level rollout, not an outage.
  return apiRelease?.trim() && workerRelease?.trim() ? "HEALTHY" : "UNKNOWN";
}

export function evaluateQueueBacklog(input: {
  waiting: number;
  active: number;
  workerCount: number | null;
  oldestWaitingAgeMs: number | null;
  throughputPerMinute: number;
  stale: boolean;
}): HealthState {
  if (input.stale) return "UNKNOWN";
  if (input.waiting > 0 && input.workerCount === 0) return "UNAVAILABLE";
  if ((input.oldestWaitingAgeMs ?? 0) >= 15 * 60_000) return "UNAVAILABLE";
  if ((input.oldestWaitingAgeMs ?? 0) >= 5 * 60_000) return "DEGRADED";
  if (input.waiting >= 100 && input.throughputPerMinute === 0 && input.active === 0) return "DEGRADED";
  return "HEALTHY";
}

const ALLOWED_METRIC_LABELS = new Set([
  "environment",
  "errorCode",
  "operation",
  "provider",
  "queue",
  "release",
  "result",
  "scheduleType",
  "service",
  "targetType",
]);

const HIGH_CARDINALITY_OR_PII = /@|\+?\d{9,}|^[a-z0-9_-]{24,}$/i;

export function validateMetricLabels(labels: Record<string, string>) {
  for (const [key, value] of Object.entries(labels)) {
    if (!ALLOWED_METRIC_LABELS.has(key)) throw new Error(`METRIC_LABEL_NOT_ALLOWED:${key}`);
    if (!value || value.length > 80 || HIGH_CARDINALITY_OR_PII.test(value)) {
      throw new Error(`METRIC_LABEL_HIGH_CARDINALITY:${key}`);
    }
  }
  return labels;
}

export function publicHealthResponse(state: HealthState) {
  return { status: state === "UNAVAILABLE" ? "unavailable" : state === "HEALTHY" ? "ok" : "degraded" } as const;
}
