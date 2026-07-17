import Redis from "ioredis";

import { getEmailProviderStatus } from "@/lib/email/email-provider";
import { prisma } from "@/server/db";
import {
  aggregateHealthState,
  evaluateLatency,
  evaluateWorkerHeartbeat,
  type HealthMetricValue,
  type HealthState,
  type ServiceHealth,
  type ServiceTier,
  type SystemHealthSnapshot,
} from "@/server/monitoring/contracts";
import { redisConnectionOptions } from "@/server/queues/client";
import { getCoreQueueOperationalMetrics } from "@/server/queues/health";
import { readWorkerHeartbeat, WORKER_HEARTBEAT_FRESH_MS } from "@/server/whatsapp/worker-heartbeat";
import { notificationHeartbeatMaxAgeMs, notificationProcessorMode, readNotificationWorkerHeartbeat } from "@/server/notifications/worker-heartbeat";

const DAY_MS = 24 * 60 * 60_000;
const SNAPSHOT_STALE_AFTER_MS = 5 * 60_000;
const PROBE_TIMEOUT_MS = Number(process.env.MONITORING_PROBE_TIMEOUT_MS || 8_000);

async function bounded<T>(factory: () => Promise<T>, fallback: T, timeoutMs = PROBE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      factory(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function environment() {
  return process.env.LOG_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
}

function release() {
  return process.env.LOG_RELEASE_VERSION
    || process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.RENDER_GIT_COMMIT
    || process.env.GIT_COMMIT
    || null;
}

function errorCode(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out|P2024/i.test(message)) return `${fallback}_TIMEOUT`;
  if (/connect|ECONN|socket|ENOTFOUND|P1001|P1002/i.test(message)) return `${fallback}_UNAVAILABLE`;
  return `${fallback}_CHECK_FAILED`;
}

function service(input: {
  id: string;
  name: string;
  state: HealthState;
  tier: ServiceTier;
  summary: string;
  checkedAt?: string;
  latencyMs?: number | null;
  safeErrorCode?: string | null;
  runbook?: string | null;
  metrics?: Record<string, HealthMetricValue>;
  release?: string | null;
}): ServiceHealth {
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  return {
    id: input.id,
    name: input.name,
    state: input.state,
    tier: input.tier,
    summary: input.summary,
    checkedAt,
    lastSuccessfulCheckAt: input.state === "HEALTHY" ? checkedAt : null,
    lastFailureAt: ["DEGRADED", "UNAVAILABLE"].includes(input.state) ? checkedAt : null,
    latencyMs: input.latencyMs ?? null,
    trend: "UNKNOWN",
    release: input.release === undefined ? release() : input.release,
    safeErrorCode: input.safeErrorCode ?? null,
    runbook: input.runbook ?? null,
    incidentId: null,
    metrics: input.metrics ?? {},
  };
}

export async function checkDatabaseHealth(): Promise<ServiceHealth> {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - started;
    let connections: Record<string, number | null> = { total: null, active: null, idle: null, waiting: null };
    let failedMigrations: number | null = null;
    try {
      const rows = await prisma.$queryRaw<Array<{ total: number; active: number; idle: number; waiting: number }>>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE state = 'active')::int AS active,
          COUNT(*) FILTER (WHERE state = 'idle')::int AS idle,
          COUNT(*) FILTER (WHERE state = 'active' AND wait_event IS NOT NULL)::int AS waiting
        FROM pg_stat_activity
        WHERE datname = current_database()
      `;
      connections = rows[0] ?? connections;
      const migrations = await prisma.$queryRaw<Array<{ failed: number }>>`
        SELECT COUNT(*) FILTER (
          WHERE finished_at IS NULL AND rolled_back_at IS NULL AND started_at < NOW() - INTERVAL '15 minutes'
        )::int AS failed
        FROM "_prisma_migrations"
      `;
      failedMigrations = migrations[0]?.failed ?? null;
    } catch {
      // The connectivity result remains authoritative if provider statistics are restricted.
    }
    const latencyState = evaluateLatency(latencyMs, Number(process.env.DB_HEALTH_DEGRADED_MS || 500), Number(process.env.DB_HEALTH_UNAVAILABLE_MS || 2_000));
    const state = failedMigrations && failedMigrations > 0
      ? "DEGRADED"
      : latencyState === "HEALTHY" ? "HEALTHY" : "DEGRADED";
    return service({
      id: "database",
      name: "PostgreSQL",
      state,
      tier: 0,
      summary: state === "HEALTHY" ? "Database connectivity and bounded query latency are healthy." : "Database requires operational review.",
      latencyMs,
      safeErrorCode: failedMigrations ? "DATABASE_MIGRATION_INCOMPLETE" : state === "HEALTHY" ? null : "DATABASE_LATENCY_HIGH",
      runbook: "/docs/runbooks/database-unavailable.md",
      metrics: { ...connections, failedMigrations },
    });
  } catch (error) {
    return service({
      id: "database",
      name: "PostgreSQL",
      state: "UNAVAILABLE",
      tier: 0,
      summary: "The API cannot complete the bounded database probe.",
      latencyMs: Date.now() - started,
      safeErrorCode: errorCode(error, "DATABASE"),
      runbook: "/docs/runbooks/database-unavailable.md",
    });
  }
}

function parseRedisInfo(info: string) {
  const values: Record<string, number> = {};
  for (const line of info.split("\n")) {
    const [key, raw] = line.trim().split(":");
    const value = Number(raw);
    if (key && Number.isFinite(value)) values[key] = value;
  }
  return values;
}

export async function checkRedisHealth(): Promise<ServiceHealth> {
  const started = Date.now();
  let redis: Redis | null = null;
  try {
    redis = new Redis({ ...redisConnectionOptions(), lazyConnect: true, maxRetriesPerRequest: 1 });
    await redis.connect();
    await redis.ping();
    const [memoryInfo, statsInfo, clientsInfo, keyCount] = await Promise.all([
      redis.info("memory"),
      redis.info("stats"),
      redis.info("clients"),
      redis.dbsize(),
    ]);
    const latencyMs = Date.now() - started;
    const info = { ...parseRedisInfo(memoryInfo), ...parseRedisInfo(statsInfo), ...parseRedisInfo(clientsInfo) };
    const latencyState = evaluateLatency(latencyMs, Number(process.env.REDIS_HEALTH_DEGRADED_MS || 250), Number(process.env.REDIS_HEALTH_UNAVAILABLE_MS || 1_000));
    const evictionState = (info.evicted_keys ?? 0) > 0 ? "DEGRADED" : "HEALTHY";
    const state = latencyState !== "HEALTHY" || evictionState === "DEGRADED" ? "DEGRADED" : "HEALTHY";
    return service({
      id: "redis",
      name: "Redis",
      state,
      tier: 0,
      summary: state === "HEALTHY" ? "Redis connectivity and command latency are healthy." : "Redis latency or eviction evidence requires review.",
      latencyMs,
      safeErrorCode: (info.evicted_keys ?? 0) > 0 ? "REDIS_EVICTIONS_DETECTED" : state === "HEALTHY" ? null : "REDIS_LATENCY_HIGH",
      runbook: "/docs/runbooks/redis-unavailable.md",
      metrics: {
        usedMemoryBytes: info.used_memory ?? null,
        maxMemoryBytes: info.maxmemory ?? null,
        connectedClients: info.connected_clients ?? null,
        evictedKeys: info.evicted_keys ?? null,
        rejectedConnections: info.rejected_connections ?? null,
        keyCount,
      },
    });
  } catch (error) {
    return service({
      id: "redis",
      name: "Redis",
      state: "UNAVAILABLE",
      tier: 0,
      summary: "Redis cannot be reached by the bounded dependency probe.",
      latencyMs: Date.now() - started,
      safeErrorCode: errorCode(error, "REDIS"),
      runbook: "/docs/runbooks/redis-unavailable.md",
    });
  } finally {
    redis?.disconnect();
  }
}

export async function checkQueuesHealth() {
  const queues = await getCoreQueueOperationalMetrics().catch(() => []);
  const state = queues.length ? aggregateHealthState(queues.map((queue) => ({ state: queue.state, tier: 0 as const }))) : "UNAVAILABLE";
  const failedLast15m = queues.reduce((sum, queue) => sum + queue.failedLast15m, 0);
  const waiting = queues.reduce((sum, queue) => sum + (queue.counts.waiting ?? 0), 0);
  const oldestWaitingAgeMs = Math.max(0, ...queues.map((queue) => queue.oldestWaitingAgeMs ?? 0));
  return {
    queues,
    service: service({
      id: "queues",
      name: "BullMQ queues",
      state,
      tier: 0,
      summary: state === "HEALTHY" ? "Queues are reachable and no actionable backlog is detected." : "Queue freshness, workers or backlog require review.",
      safeErrorCode: state === "HEALTHY" ? null : "QUEUE_OPERATIONAL_HEALTH_FAILED",
      runbook: "/docs/runbooks/queue-backlog.md",
      metrics: { queueCount: queues.length, waiting, failedLast15m, oldestWaitingAgeMs },
    }),
  };
}

export async function checkWorkerHealth(): Promise<{ service: ServiceHealth; heartbeat: Awaited<ReturnType<typeof readWorkerHeartbeat>> }> {
  try {
    const heartbeat = await readWorkerHeartbeat();
    const state = evaluateWorkerHeartbeat(heartbeat, Date.now(), WORKER_HEARTBEAT_FRESH_MS);
    const heartbeatAgeMs = heartbeat ? Math.max(0, Date.now() - new Date(heartbeat.lastHeartbeatAt).getTime()) : null;
    return {
      heartbeat,
      service: service({
        id: "worker",
        name: "WhatsApp message worker",
        state,
        tier: 0,
        summary: state === "HEALTHY" ? "The worker heartbeat is fresh and reports a consumable state." : "The worker heartbeat is stale, missing or degraded.",
        safeErrorCode: state === "HEALTHY" ? null : "WORKER_HEARTBEAT_MISSING_OR_STALE",
        runbook: "/docs/runbooks/worker-heartbeat-missing.md",
        release: heartbeat?.release ?? null,
        metrics: {
          heartbeatAgeMs,
          currentJobs: heartbeat?.currentJobs ?? null,
          capacity: heartbeat?.capacity ?? null,
          queueCount: heartbeat?.queueNames.length ?? 0,
          workerStatus: heartbeat?.status ?? "UNKNOWN",
        },
      }),
    };
  } catch (error) {
    return {
      heartbeat: null,
      service: service({
        id: "worker",
        name: "WhatsApp message worker",
        state: "UNKNOWN",
        tier: 0,
        summary: "Worker heartbeat evidence could not be read safely.",
        safeErrorCode: errorCode(error, "WORKER_HEARTBEAT"),
        runbook: "/docs/runbooks/worker-heartbeat-missing.md",
      }),
    };
  }
}

async function checkWhatsAppHealth(workerState: HealthState): Promise<ServiceHealth> {
  const since = new Date(Date.now() - DAY_MS);
  try {
    const [accountGroups, sent, failed, restored] = await Promise.all([
      prisma.whatsAppAccount.groupBy({ by: ["status"], where: { archivedAt: null }, _count: { _all: true } }),
      prisma.messageRecipient.count({ where: { status: "SENT", sentAt: { gte: since } } }),
      prisma.messageRecipient.count({ where: { status: "FAILED", failedAt: { gte: since } } }),
      prisma.whatsAppAccount.count({ where: { sessionRestoredAt: { gte: since }, archivedAt: null } }),
    ]);
    const accounts = Object.fromEntries(accountGroups.map((entry) => [entry.status, entry._count._all]));
    const totalDeliveries = sent + failed;
    const failureRate = totalDeliveries > 0 ? Number(((failed / totalDeliveries) * 100).toFixed(2)) : 0;
    const connectedAccounts = accounts.CONNECTED ?? 0;
    const reconnectRequiredAccounts = accounts.RECONNECT_REQUIRED ?? 0;
    const failedAccounts = accounts.FAILED ?? 0;
    const disconnectedAccounts = accounts.DISCONNECTED ?? 0;
    const totalAccounts = Object.values(accounts).reduce((sum, count) => sum + Number(count), 0);
    const accountsRequiringAttention = reconnectRequiredAccounts + failedAccounts + disconnectedAccounts;
    const state: HealthState = workerState === "UNAVAILABLE"
      ? "UNAVAILABLE"
      : workerState !== "HEALTHY"
        ? "DEGRADED"
        : totalAccounts > 0 && connectedAccounts === 0
          ? "UNAVAILABLE"
          : accountsRequiringAttention > 0
            ? "DEGRADED"
        : totalDeliveries >= 10 && failureRate >= 20
          ? "DEGRADED"
          : "HEALTHY";
    const whatsappErrorCode = workerState !== "HEALTHY"
      ? "WHATSAPP_WORKER_NOT_HEALTHY"
      : totalAccounts > 0 && connectedAccounts === 0
        ? "WHATSAPP_NO_CONNECTED_ACCOUNTS"
        : accountsRequiringAttention > 0
          ? "WHATSAPP_ACCOUNTS_REQUIRE_ATTENTION"
          : totalDeliveries >= 10 && failureRate >= 20
            ? "WHATSAPP_DELIVERY_FAILURE_RATE_HIGH"
            : null;
    return service({
      id: "whatsapp",
      name: "WhatsApp operations",
      state,
      tier: 0,
      summary: state === "HEALTHY" ? "Worker and aggregate WhatsApp delivery evidence are healthy." : "Worker or aggregate delivery reliability requires review.",
      safeErrorCode: whatsappErrorCode,
      runbook: "/docs/runbooks/whatsapp-reconnect-failure.md",
      metrics: {
        connectedAccounts,
        connectingAccounts: accounts.CONNECTING ?? 0,
        reconnectRequiredAccounts,
        failedAccounts,
        disconnectedAccounts,
        restoredLast24h: restored,
        sentLast24h: sent,
        failedLast24h: failed,
        deliveryFailureRate: failureRate,
      },
    });
  } catch (error) {
    return service({ id: "whatsapp", name: "WhatsApp operations", state: "UNKNOWN", tier: 0, summary: "WhatsApp aggregate evidence could not be read.", safeErrorCode: errorCode(error, "WHATSAPP"), runbook: "/docs/runbooks/whatsapp-reconnect-failure.md" });
  }
}

export async function getWhatsAppOperationalHealth(): Promise<ServiceHealth> {
  const workerFallback = {
    heartbeat: null,
    service: service({
      id: "worker",
      name: "WhatsApp message worker",
      state: "UNKNOWN",
      tier: 0,
      summary: "Worker heartbeat probe exceeded its bound.",
      safeErrorCode: "WORKER_PROBE_TIMEOUT",
      runbook: "/docs/runbooks/worker-heartbeat-missing.md",
    }),
  };
  const worker = await bounded(checkWorkerHealth, workerFallback);
  return bounded(
    () => checkWhatsAppHealth(worker.service.state),
    service({
      id: "whatsapp",
      name: "WhatsApp operations",
      state: "UNKNOWN",
      tier: 0,
      summary: "WhatsApp operational probe exceeded its bound.",
      safeErrorCode: "WHATSAPP_PROBE_TIMEOUT",
      runbook: "/docs/runbooks/whatsapp-reconnect-failure.md",
    }),
  );
}

async function checkMessagingAndSchedulerHealth(): Promise<ServiceHealth[]> {
  const since = new Date(Date.now() - DAY_MS);
  const overdueBefore = new Date(Date.now() - 5 * 60_000);
  try {
    const [campaigns, failedCampaigns, sentTargets, failedTargets, overdueScheduled, overdueRecurring] = await Promise.all([
      prisma.messageCampaign.count({ where: { createdAt: { gte: since } } }),
      prisma.messageCampaign.count({ where: { createdAt: { gte: since }, status: "FAILED" } }),
      prisma.messageRecipient.count({ where: { sentAt: { gte: since }, status: "SENT" } }),
      prisma.messageRecipient.count({ where: { failedAt: { gte: since }, status: "FAILED" } }),
      prisma.messageCampaign.count({ where: { scheduleType: "SCHEDULED", status: { in: ["QUEUED", "SENDING"] }, scheduledAt: { lt: overdueBefore } } }),
      prisma.messageCampaign.count({ where: { scheduleType: "RECURRING", status: { in: ["QUEUED", "SENDING"] }, nextRunAt: { lt: overdueBefore } } }),
    ]);
    const targets = sentTargets + failedTargets;
    const failureRate = targets ? Number(((failedTargets / targets) * 100).toFixed(2)) : 0;
    const messagingState: HealthState = targets >= 10 && failureRate >= 20 ? "DEGRADED" : "HEALTHY";
    const overdue = overdueScheduled + overdueRecurring;
    const schedulerState: HealthState = overdue >= 10 ? "UNAVAILABLE" : overdue > 0 ? "DEGRADED" : "HEALTHY";
    return [
      service({ id: "messaging", name: "Message delivery", state: messagingState, tier: 0, summary: messagingState === "HEALTHY" ? "Aggregate message delivery is within the initial operating threshold." : "Message failure rate is above the initial threshold.", safeErrorCode: messagingState === "HEALTHY" ? null : "MESSAGE_FAILURE_RATE_HIGH", runbook: "/docs/runbooks/message-failure-spike.md", metrics: { campaignsLast24h: campaigns, failedCampaignsLast24h: failedCampaigns, sentTargetsLast24h: sentTargets, failedTargetsLast24h: failedTargets, failureRate } }),
      service({ id: "scheduler", name: "Scheduled and recurring jobs", state: schedulerState, tier: 1, summary: schedulerState === "HEALTHY" ? "No scheduled campaign is overdue beyond the grace window." : "Scheduled or recurring campaigns are overdue.", safeErrorCode: schedulerState === "HEALTHY" ? null : "SCHEDULED_CAMPAIGN_OVERDUE", runbook: "/docs/runbooks/queue-backlog.md", metrics: { overdueScheduled, overdueRecurring } }),
    ];
  } catch (error) {
    const code = errorCode(error, "MESSAGING_METRICS");
    return [
      service({ id: "messaging", name: "Message delivery", state: "UNKNOWN", tier: 0, summary: "Message delivery metrics could not be read.", safeErrorCode: code, runbook: "/docs/runbooks/message-failure-spike.md" }),
      service({ id: "scheduler", name: "Scheduled and recurring jobs", state: "UNKNOWN", tier: 1, summary: "Scheduler metrics could not be read.", safeErrorCode: code, runbook: "/docs/runbooks/queue-backlog.md" }),
    ];
  }
}

async function checkSyncHealth(): Promise<ServiceHealth> {
  const since = new Date(Date.now() - DAY_MS);
  try {
    const [completed, failed, active, discovered, persisted, named, fallback] = await Promise.all([
      prisma.contactSyncRun.count({ where: { status: "COMPLETED", completedAt: { gte: since } } }),
      prisma.contactSyncRun.count({ where: { status: "FAILED", updatedAt: { gte: since } } }),
      prisma.contactSyncRun.count({ where: { status: { in: ["QUEUED", "RUNNING"] }, updatedAt: { lt: new Date(Date.now() - 30 * 60_000) } } }),
      prisma.contactSyncRun.aggregate({ where: { createdAt: { gte: since } }, _sum: { discoveredCount: true } }),
      prisma.contactSyncRun.aggregate({ where: { createdAt: { gte: since } }, _sum: { persistedCount: true } }),
      prisma.contactSyncRun.aggregate({ where: { createdAt: { gte: since } }, _sum: { namedCount: true } }),
      prisma.contactSyncRun.aggregate({ where: { createdAt: { gte: since } }, _sum: { fallbackCount: true } }),
    ]);
    const totalRuns = completed + failed;
    const failureRate = totalRuns ? Number(((failed / totalRuns) * 100).toFixed(2)) : 0;
    const state: HealthState = active > 0 || (totalRuns >= 3 && failureRate >= 50) ? "DEGRADED" : "HEALTHY";
    return service({ id: "sync", name: "Contact and group synchronization", state, tier: 1, summary: state === "HEALTHY" ? "Recent contact synchronization evidence is within threshold." : "Stuck or repeatedly failed synchronization requires review.", safeErrorCode: state === "HEALTHY" ? null : "SYNC_FAILURE_RATE_OR_STALE_RUN_HIGH", runbook: "/docs/runbooks/whatsapp-reconnect-failure.md", metrics: { completedLast24h: completed, failedLast24h: failed, staleActiveRuns: active, discoveredLast24h: discovered._sum.discoveredCount ?? 0, persistedLast24h: persisted._sum.persistedCount ?? 0, namedLast24h: named._sum.namedCount ?? 0, fallbackLast24h: fallback._sum.fallbackCount ?? 0 } });
  } catch (error) {
    return service({ id: "sync", name: "Contact and group synchronization", state: "UNKNOWN", tier: 1, summary: "Synchronization metrics could not be read.", safeErrorCode: errorCode(error, "SYNC_METRICS"), runbook: "/docs/runbooks/whatsapp-reconnect-failure.md" });
  }
}

async function checkSupportAndEmailHealth(): Promise<ServiceHealth[]> {
  const since = new Date(Date.now() - DAY_MS);
  const staleBefore = new Date(Date.now() - 10 * 60_000);
  try {
    const provider = getEmailProviderStatus();
    const [tickets, waitingForAdmin, outboxPending, outboxFailed, emailsSent, emailsFailed, staleEmails] = await Promise.all([
      prisma.supportTicket.count({ where: { createdAt: { gte: since } } }),
      prisma.supportTicket.count({ where: { status: { in: ["OPEN", "PENDING", "WAITING_FOR_ADMIN"] } } }),
      prisma.supportNotificationOutbox.count({ where: { status: { in: ["PENDING", "PROCESSING"] }, availableAt: { lt: staleBefore } } }),
      prisma.supportNotificationOutbox.count({ where: { status: "FAILED", updatedAt: { gte: since } } }),
      prisma.emailDeliveryLog.count({ where: { status: "SENT", createdAt: { gte: since } } }),
      prisma.emailDeliveryLog.count({ where: { status: "FAILED", createdAt: { gte: since } } }),
      prisma.emailDeliveryLog.count({ where: { status: "PENDING", createdAt: { lt: staleBefore } } }),
    ]);
    const supportState: HealthState = outboxPending >= 10 || outboxFailed >= 5 ? "DEGRADED" : "HEALTHY";
    const emailTotal = emailsSent + emailsFailed;
    const emailFailureRate = emailTotal ? Number(((emailsFailed / emailTotal) * 100).toFixed(2)) : 0;
    const emailState: HealthState = !provider.configured
      ? "UNKNOWN"
      : staleEmails > 0 || (emailTotal >= 5 && emailFailureRate >= 20)
        ? "DEGRADED"
        : "HEALTHY";
    return [
      service({ id: "support", name: "Support flow", state: supportState, tier: 1, summary: supportState === "HEALTHY" ? "Ticket persistence and notification outbox are within threshold." : "Support notification backlog or failures require review.", safeErrorCode: supportState === "HEALTHY" ? null : "SUPPORT_NOTIFICATION_BACKLOG", runbook: "/docs/runbooks/support-flow-failure.md", metrics: { ticketsLast24h: tickets, waitingForAdmin, staleOutboxItems: outboxPending, failedOutboxLast24h: outboxFailed } }),
      service({ id: "email", name: "Email delivery", state: emailState, tier: 1, summary: !provider.configured ? "No email provider is configured; delivery health is unknown." : emailState === "HEALTHY" ? "Email configuration and recent delivery evidence are healthy." : "Email failures or stale pending deliveries require review.", safeErrorCode: !provider.configured ? "EMAIL_PROVIDER_NOT_CONFIGURED" : emailState === "HEALTHY" ? null : "EMAIL_DELIVERY_FAILURE_RATE_HIGH", runbook: "/docs/runbooks/email-delivery-failure.md", metrics: { provider: provider.provider, configured: provider.configured, sentLast24h: emailsSent, failedLast24h: emailsFailed, failureRate: emailFailureRate, stalePending: staleEmails } }),
    ];
  } catch (error) {
    const code = errorCode(error, "SUPPORT_EMAIL_METRICS");
    return [
      service({ id: "support", name: "Support flow", state: "UNKNOWN", tier: 1, summary: "Support flow metrics could not be read.", safeErrorCode: code, runbook: "/docs/runbooks/support-flow-failure.md" }),
      service({ id: "email", name: "Email delivery", state: "UNKNOWN", tier: 1, summary: "Email delivery metrics could not be read.", safeErrorCode: code, runbook: "/docs/runbooks/email-delivery-failure.md" }),
    ];
  }
}

async function checkNotificationPlatformHealth(): Promise<ServiceHealth> {
  const since = new Date(Date.now() - DAY_MS);
  const staleBefore = new Date(Date.now() - 10 * 60_000);
  try {
    const [queued, staleProcessing, deadLetters, delivered, failed, workerHeartbeat] = await Promise.all([
      prisma.notificationOutbox.count({ where: { status: { in: ["PENDING", "QUEUED"] } } }),
      prisma.notificationOutbox.count({ where: { status: "PROCESSING", leaseExpiresAt: { lt: new Date() } } }),
      prisma.notificationDeadLetter.count({ where: { resolvedAt: null } }),
      prisma.notificationDelivery.count({ where: { status: { in: ["SENT", "ACCEPTED", "DELIVERED"] }, createdAt: { gte: since } } }),
      prisma.notificationDelivery.count({ where: { status: { in: ["FAILED", "BOUNCED", "REJECTED", "DEAD_LETTERED"] }, createdAt: { gte: since } } }),
      readNotificationWorkerHeartbeat(),
    ]);
    const staleQueued = await prisma.notificationOutbox.count({
      where: { status: { in: ["PENDING", "QUEUED"] }, availableAt: { lt: staleBefore } },
    });
    const attempts = delivered + failed;
    const failureRate = attempts ? Number(((failed / attempts) * 100).toFixed(2)) : 0;
    const processorMode = notificationProcessorMode();
    const heartbeatMaxAgeMs = notificationHeartbeatMaxAgeMs(processorMode);
    const workerAgeMs = workerHeartbeat ? Math.max(0, Date.now() - new Date(workerHeartbeat.lastHeartbeatAt).getTime()) : null;
    const processorRequired = environment() === "production" || process.env.NOTIFICATION_WORKER_REQUIRED === "true";
    const processorUnhealthy = processorRequired && (
      !workerHeartbeat
      || workerHeartbeat.mode !== processorMode
      || workerHeartbeat.status !== "HEALTHY"
      || (workerAgeMs ?? Number.POSITIVE_INFINITY) > heartbeatMaxAgeMs
    );
    const state: HealthState = processorUnhealthy || deadLetters >= 5 || staleQueued >= 25 || staleProcessing > 0 || (attempts >= 10 && failureRate >= 25)
      ? "DEGRADED"
      : "HEALTHY";
    return service({
      id: "notifications",
      name: "Notification delivery platform",
      state,
      tier: 1,
      summary: state === "HEALTHY" ? "Notification outbox, delivery and dead-letter evidence are within threshold." : "Notification backlog, failed deliveries or dead letters require review.",
      safeErrorCode: state === "HEALTHY" ? null : "NOTIFICATION_DELIVERY_DEGRADED",
      runbook: "/docs/runbooks/notification-delivery-failure.md",
      metrics: { queued, staleQueued, staleProcessing, unresolvedDeadLetters: deadLetters, deliveredLast24h: delivered, failedLast24h: failed, failureRate, processorMode, heartbeatMaxAgeMs, workerHeartbeatAgeMs: workerAgeMs, workerStatus: workerHeartbeat?.status ?? "MISSING", workerMode: workerHeartbeat?.mode ?? "MISSING", workerRelease: workerHeartbeat?.release ?? null },
    });
  } catch (error) {
    return service({ id: "notifications", name: "Notification delivery platform", state: "UNKNOWN", tier: 1, summary: "Notification platform metrics could not be read.", safeErrorCode: errorCode(error, "NOTIFICATION_METRICS"), runbook: "/docs/runbooks/notification-delivery-failure.md" });
  }
}

async function checkAuthAndSubscriptionHealth(): Promise<ServiceHealth[]> {
  const since = new Date(Date.now() - 60 * 60_000);
  try {
    const [loginTotal, loginFailed, openEntitlementAlerts, activeSubscriptions, expiredSubscriptions] = await Promise.all([
      prisma.loginAttempt.count({ where: { createdAt: { gte: since } } }),
      prisma.loginAttempt.count({ where: { createdAt: { gte: since }, success: false } }),
      prisma.operationalAlert.count({ where: { status: { in: ["OPEN", "ACKNOWLEDGED"] }, type: { contains: "ENTITLEMENT" } } }),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.subscription.count({ where: { status: "EXPIRED" } }),
    ]);
    const failureRate = loginTotal ? Number(((loginFailed / loginTotal) * 100).toFixed(2)) : 0;
    const authState: HealthState = loginTotal >= 20 && failureRate >= 50 ? "DEGRADED" : "HEALTHY";
    const subscriptionState: HealthState = openEntitlementAlerts > 0 ? "DEGRADED" : "HEALTHY";
    return [
      service({ id: "authentication", name: "Authentication", state: authState, tier: 0, summary: authState === "HEALTHY" ? "Recent aggregate login evidence is within threshold." : "Login failure rate is elevated.", safeErrorCode: authState === "HEALTHY" ? null : "LOGIN_FAILURE_RATE_HIGH", runbook: "/docs/runbooks/security-incident.md", metrics: { loginAttemptsLastHour: loginTotal, loginFailuresLastHour: loginFailed, failureRate } }),
      service({ id: "subscriptions", name: "Subscription entitlements", state: subscriptionState, tier: 0, summary: subscriptionState === "HEALTHY" ? "No open entitlement operational alert is present." : "Entitlement alerts require review.", safeErrorCode: subscriptionState === "HEALTHY" ? null : "ENTITLEMENT_ALERT_OPEN", metrics: { activeSubscriptions, expiredSubscriptions, openEntitlementAlerts } }),
    ];
  } catch (error) {
    const code = errorCode(error, "AUTH_SUBSCRIPTION_METRICS");
    return [
      service({ id: "authentication", name: "Authentication", state: "UNKNOWN", tier: 0, summary: "Authentication metrics could not be read.", safeErrorCode: code, runbook: "/docs/runbooks/security-incident.md" }),
      service({ id: "subscriptions", name: "Subscription entitlements", state: "UNKNOWN", tier: 0, summary: "Subscription metrics could not be read.", safeErrorCode: code }),
    ];
  }
}

type GitHubRun = { status?: string; conclusion?: string | null; updated_at?: string; html_url?: string; head_sha?: string };
let backupRunCache: { expiresAt: number; value: GitHubRun | null } | null = null;

async function latestBackupRun(): Promise<GitHubRun | null> {
  if (backupRunCache && backupRunCache.expiresAt > Date.now()) return backupRunCache.value;
  const repository = process.env.MONITORING_GITHUB_REPOSITORY || "logivyia/logivya";
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "logivya-monitoring" };
  if (process.env.GITHUB_MONITORING_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_MONITORING_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/database-backup.yml/runs?per_page=1`, {
    headers,
    signal: AbortSignal.timeout(2_500),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("BACKUP_PROVIDER_UNAVAILABLE");
  const body = await response.json() as { workflow_runs?: GitHubRun[] };
  const value = body.workflow_runs?.[0] ?? null;
  backupRunCache = { expiresAt: Date.now() + 10 * 60_000, value };
  return value;
}

async function checkBackupAndDeploymentHealth(workerRelease: string | null): Promise<ServiceHealth[]> {
  let backup = service({ id: "backups", name: "Database backups", state: "UNKNOWN", tier: 1, summary: "Backup freshness has not been verified.", safeErrorCode: "BACKUP_STATUS_UNKNOWN", runbook: "/docs/runbooks/backup-verification-failure.md", release: null });
  try {
    const run = await latestBackupRun();
    const updatedAt = run?.updated_at ? new Date(run.updated_at) : null;
    const ageMs = updatedAt && Number.isFinite(updatedAt.getTime()) ? Date.now() - updatedAt.getTime() : null;
    const state: HealthState = !run || !updatedAt
      ? "UNKNOWN"
      : run.status !== "completed"
        ? "DEGRADED"
        : run.conclusion !== "success" || (ageMs ?? Infinity) > 36 * 60 * 60_000
          ? "UNAVAILABLE"
          : "HEALTHY";
    backup = service({ id: "backups", name: "Database backups", state, tier: 1, summary: state === "HEALTHY" ? "The latest scheduled backup workflow completed successfully within the freshness window." : "The latest backup workflow is missing, stale, running or failed.", checkedAt: new Date().toISOString(), safeErrorCode: state === "HEALTHY" ? null : run?.conclusion === "failure" ? "BACKUP_WORKFLOW_FAILED" : "BACKUP_NOT_FRESH", runbook: "/docs/runbooks/backup-verification-failure.md", release: run?.head_sha ?? null, metrics: { workflowStatus: run?.status ?? null, conclusion: run?.conclusion ?? null, ageMs } });
  } catch {
    // Keep UNKNOWN; provider monitoring failure must not become false healthy.
  }

  const apiRelease = release();
  const deploymentState: HealthState = !apiRelease || !workerRelease
    ? "UNKNOWN"
    : apiRelease !== workerRelease
      ? "DEGRADED"
      : "HEALTHY";
  const deployment = service({
    id: "deployments",
    name: "Production deployment",
    state: deploymentState,
    tier: 1,
    summary: deploymentState === "HEALTHY" ? "API and worker report the same release." : deploymentState === "DEGRADED" ? "API and worker releases differ." : "Release evidence is incomplete.",
    safeErrorCode: deploymentState === "HEALTHY" ? null : deploymentState === "DEGRADED" ? "DEPLOYMENT_RELEASE_MISMATCH" : "DEPLOYMENT_RELEASE_UNKNOWN",
    runbook: "/docs/runbooks/bad-deployment.md",
    metrics: { apiRelease, workerRelease },
  });
  return [backup, deployment];
}

async function checkStorageAndPushHealth(): Promise<ServiceHealth[]> {
  try {
    const [snapshots, pushTokens, notificationsLast24h] = await Promise.all([
      prisma.whatsAppSession.count({ where: { sessionDataEncrypted: { not: null } } }),
      prisma.mobilePushToken.count({ where: { revokedAt: null } }),
      prisma.notification.count({ where: { createdAt: { gte: new Date(Date.now() - DAY_MS) } } }),
    ]);
    return [
      service({ id: "storage", name: "Session and object storage", state: snapshots > 0 ? "HEALTHY" : "UNKNOWN", tier: 1, summary: snapshots > 0 ? "Encrypted WhatsApp session snapshots are present in durable storage." : "No durable session snapshot evidence is available; object storage has no active probe.", safeErrorCode: snapshots > 0 ? null : "STORAGE_EVIDENCE_MISSING", metrics: { encryptedSessionSnapshots: snapshots, objectStorageConfigured: Boolean(process.env.S3_BUCKET) } }),
      service({ id: "push", name: "Push notifications", state: pushTokens > 0 ? "HEALTHY" : "UNKNOWN", tier: 1, summary: pushTokens > 0 ? "Encrypted push tokens are present; Expo receipts are reconciled by the notification worker." : "No active push token is available for provider delivery verification.", safeErrorCode: pushTokens > 0 ? null : "PUSH_ACTIVE_TOKEN_MISSING", metrics: { activePushTokens: pushTokens, notificationsLast24h, receiptProcessing: "NOTIFICATION_WORKER" } }),
    ];
  } catch (error) {
    const code = errorCode(error, "STORAGE_PUSH_METRICS");
    return [
      service({ id: "storage", name: "Session and object storage", state: "UNKNOWN", tier: 1, summary: "Storage evidence could not be read.", safeErrorCode: code }),
      service({ id: "push", name: "Push notifications", state: "UNKNOWN", tier: 1, summary: "Push notification evidence could not be read.", safeErrorCode: code }),
    ];
  }
}

export async function getCoreReadiness() {
  const databaseFallback = service({ id: "database", name: "PostgreSQL", state: "UNAVAILABLE", tier: 0, summary: "Database readiness probe exceeded its bound.", safeErrorCode: "DATABASE_PROBE_TIMEOUT", runbook: "/docs/runbooks/database-unavailable.md" });
  const redisFallback = service({ id: "redis", name: "Redis", state: "UNAVAILABLE", tier: 0, summary: "Redis readiness probe exceeded its bound.", safeErrorCode: "REDIS_PROBE_TIMEOUT", runbook: "/docs/runbooks/redis-unavailable.md" });
  const queueFallback = { queues: [], service: service({ id: "queues", name: "BullMQ queues", state: "UNAVAILABLE", tier: 0, summary: "Queue readiness probe exceeded its bound.", safeErrorCode: "QUEUE_PROBE_TIMEOUT", runbook: "/docs/runbooks/queue-backlog.md" }) };
  const workerFallback = { heartbeat: null, service: service({ id: "worker", name: "WhatsApp message worker", state: "UNKNOWN", tier: 0, summary: "Worker heartbeat probe exceeded its bound.", safeErrorCode: "WORKER_PROBE_TIMEOUT", runbook: "/docs/runbooks/worker-heartbeat-missing.md" }) };
  const [database, redis, queueResult, workerResult] = await Promise.all([
    bounded(checkDatabaseHealth, databaseFallback),
    bounded(checkRedisHealth, redisFallback),
    bounded(checkQueuesHealth, queueFallback),
    bounded(checkWorkerHealth, workerFallback),
  ]);
  const services = [database, redis, queueResult.service, workerResult.service];
  return { status: aggregateHealthState(services), services };
}

export async function getSystemHealthSnapshot(): Promise<SystemHealthSnapshot> {
  const generatedAt = new Date().toISOString();
  const unknown = (id: string, name: string, tier: ServiceTier, code: string, runbook?: string) => service({ id, name, state: "UNKNOWN", tier, summary: `${name} monitoring evidence exceeded its bounded collection window.`, safeErrorCode: code, runbook });
  const queueFallback = { queues: [], service: unknown("queues", "BullMQ queues", 0, "QUEUE_PROBE_TIMEOUT", "/docs/runbooks/queue-backlog.md") };
  const workerFallback = { heartbeat: null, service: unknown("worker", "WhatsApp message worker", 0, "WORKER_PROBE_TIMEOUT", "/docs/runbooks/worker-heartbeat-missing.md") };
  const [database, redis, queueResult, workerResult, messaging, sync, supportEmail, notificationPlatform, authSubscriptions, storagePush] = await Promise.all([
    bounded(checkDatabaseHealth, unknown("database", "PostgreSQL", 0, "DATABASE_PROBE_TIMEOUT", "/docs/runbooks/database-unavailable.md")),
    bounded(checkRedisHealth, unknown("redis", "Redis", 0, "REDIS_PROBE_TIMEOUT", "/docs/runbooks/redis-unavailable.md")),
    bounded(checkQueuesHealth, queueFallback),
    bounded(checkWorkerHealth, workerFallback),
    bounded(checkMessagingAndSchedulerHealth, [unknown("messaging", "Message delivery", 0, "MESSAGING_PROBE_TIMEOUT", "/docs/runbooks/message-failure-spike.md"), unknown("scheduler", "Scheduled and recurring jobs", 1, "SCHEDULER_PROBE_TIMEOUT", "/docs/runbooks/queue-backlog.md")]),
    bounded(checkSyncHealth, unknown("sync", "Contact and group synchronization", 1, "SYNC_PROBE_TIMEOUT", "/docs/runbooks/whatsapp-reconnect-failure.md")),
    bounded(checkSupportAndEmailHealth, [unknown("support", "Support flow", 1, "SUPPORT_PROBE_TIMEOUT", "/docs/runbooks/support-flow-failure.md"), unknown("email", "Email delivery", 1, "EMAIL_PROBE_TIMEOUT", "/docs/runbooks/email-delivery-failure.md")]),
    bounded(checkNotificationPlatformHealth, unknown("notifications", "Notification delivery platform", 1, "NOTIFICATION_PROBE_TIMEOUT", "/docs/runbooks/notification-delivery-failure.md")),
    bounded(checkAuthAndSubscriptionHealth, [unknown("authentication", "Authentication", 0, "AUTH_PROBE_TIMEOUT", "/docs/runbooks/security-incident.md"), unknown("subscriptions", "Subscription entitlements", 0, "SUBSCRIPTION_PROBE_TIMEOUT")]),
    bounded(checkStorageAndPushHealth, [unknown("storage", "Session and object storage", 1, "STORAGE_PROBE_TIMEOUT"), unknown("push", "Push notifications", 1, "PUSH_PROBE_TIMEOUT")]),
  ]);
  const [whatsapp, backupDeployment, incidents, alerts] = await Promise.all([
    bounded(() => checkWhatsAppHealth(workerResult.service.state), unknown("whatsapp", "WhatsApp operations", 0, "WHATSAPP_PROBE_TIMEOUT", "/docs/runbooks/whatsapp-reconnect-failure.md")),
    bounded(() => checkBackupAndDeploymentHealth(workerResult.heartbeat?.release ?? null), [unknown("backups", "Database backups", 1, "BACKUP_PROBE_TIMEOUT", "/docs/runbooks/backup-verification-failure.md"), unknown("deployments", "Production deployment", 1, "DEPLOYMENT_PROBE_TIMEOUT", "/docs/runbooks/bad-deployment.md")], 10_000),
    bounded(() => prisma.incidentLog.findMany({ where: { resolvedAt: null }, orderBy: { startedAt: "desc" }, take: 30 }), []),
    bounded(() => prisma.operationalAlert.findMany({ where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } }, orderBy: { lastSeenAt: "desc" }, take: 30 }), []),
  ]);
  const services = [
    service({ id: "api", name: "Backend API", state: "HEALTHY", tier: 0, summary: "The API process is live and completed this health aggregation." }),
    database,
    redis,
    queueResult.service,
    workerResult.service,
    whatsapp,
    ...messaging,
    sync,
    ...supportEmail,
    notificationPlatform,
    ...authSubscriptions,
    ...storagePush,
    ...backupDeployment,
  ];
  const incidentByService = new Map<string, string>();
  for (const incident of incidents) {
    const metadata = incident.metadata && typeof incident.metadata === "object" && !Array.isArray(incident.metadata) ? incident.metadata as Record<string, unknown> : {};
    if (typeof metadata.service === "string") incidentByService.set(metadata.service, incident.id);
  }
  for (const item of services) item.incidentId = incidentByService.get(item.id) ?? null;

  const capacityWarnings: SystemHealthSnapshot["capacityWarnings"] = [];
  for (const queue of queueResult.queues) {
    if ((queue.oldestWaitingAgeMs ?? 0) >= 5 * 60_000) capacityWarnings.push({ code: "QUEUE_JOB_AGE_HIGH", severity: queue.state === "UNAVAILABLE" ? "CRITICAL" : "HIGH", message: `${queue.name} has aged waiting work.`, service: "queues" });
  }
  const redisMemory = Number(redis.metrics.usedMemoryBytes ?? 0);
  const redisMax = Number(redis.metrics.maxMemoryBytes ?? 0);
  if (redisMax > 0 && redisMemory / redisMax >= 0.8) capacityWarnings.push({ code: "REDIS_MEMORY_HIGH", severity: "HIGH", message: "Redis memory usage is above 80%.", service: "redis" });

  return {
    status: aggregateHealthState(services),
    service: "logivya-platform",
    environment: environment(),
    release: release(),
    generatedAt,
    staleAfterMs: SNAPSHOT_STALE_AFTER_MS,
    services,
    queues: queueResult.queues,
    incidents: incidents.map((incident) => ({
      id: incident.id,
      title: incident.title,
      description: incident.description,
      severity: incident.severity,
      status: incident.status,
      startedAt: incident.startedAt.toISOString(),
      resolvedAt: incident.resolvedAt?.toISOString() ?? null,
      metadata: incident.metadata,
    })),
    alerts: alerts.map((alert) => ({
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      status: alert.status,
      service: alert.service,
      message: alert.message,
      occurrenceCount: alert.occurrenceCount,
      firstSeenAt: alert.firstSeenAt.toISOString(),
      lastSeenAt: alert.lastSeenAt.toISOString(),
      correlationId: alert.correlationId,
    })),
    capacityWarnings,
  };
}
