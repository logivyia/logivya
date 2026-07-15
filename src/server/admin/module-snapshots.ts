import type { Prisma } from "@prisma/client";

import { locales } from "@/i18n/config";
import { CORE_PLAN_CODES, CORE_PLAN_MATRIX } from "@/server/billing/plan-matrix";
import { prisma } from "@/server/db";

export const ADMIN_SNAPSHOT_MODULES = [
  "billing",
  "whatsapp-accounts",
  "campaigns",
  "compliance",
  "audit",
  "notifications",
  "data-requests",
  "backups",
  "disaster-recovery",
  "settings",
  "feature-flags",
  "announcements",
  "api-usage",
  "webhooks",
  "platform-settings",
] as const;

export type AdminSnapshotModule = (typeof ADMIN_SNAPSHOT_MODULES)[number];

type SnapshotValue = string | number | boolean | null;

export type AdminSnapshotItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  fields: Record<string, SnapshotValue>;
};

export type AdminModuleSnapshot = {
  module: AdminSnapshotModule;
  generatedAt: string;
  metrics: Record<string, SnapshotValue>;
  items: AdminSnapshotItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    nextPage: number | null;
  };
  capabilities: {
    search: boolean;
    filters: string[];
    actions: string[];
    readOnly: boolean;
    readOnlyReason?: string;
  };
};

type SnapshotQuery = {
  page: number;
  limit: number;
  search: string;
  status: string;
  companyId: string;
  dateFrom?: Date;
  dateTo?: Date;
};

export function isAdminSnapshotModule(value: string): value is AdminSnapshotModule {
  return (ADMIN_SNAPSHOT_MODULES as readonly string[]).includes(value);
}

export function parseAdminSnapshotQuery(request: Request): SnapshotQuery {
  const params = new URL(request.url).searchParams;
  const page = clampInteger(params.get("page"), 1, 10_000, 1);
  const limit = clampInteger(params.get("limit"), 1, 100, 30);
  return {
    page,
    limit,
    search: params.get("q")?.trim() || params.get("search")?.trim() || "",
    status: params.get("status")?.trim().toUpperCase() || "",
    companyId: params.get("companyId")?.trim() || "",
    dateFrom: parseDate(params.get("dateFrom"), false),
    dateTo: parseDate(params.get("dateTo"), true),
  };
}

export async function getAdminModuleSnapshot(module: AdminSnapshotModule, query: SnapshotQuery): Promise<AdminModuleSnapshot> {
  switch (module) {
    case "billing":
      return billingSnapshot(query);
    case "whatsapp-accounts":
      return whatsappAccountsSnapshot(query);
    case "campaigns":
      return campaignsSnapshot(query);
    case "compliance":
      return complianceSnapshot(query);
    case "audit":
      return auditSnapshot(query);
    case "notifications":
      return notificationsSnapshot(query);
    case "data-requests":
      return dataRequestsSnapshot(query);
    case "backups":
      return backupsSnapshot(query);
    case "disaster-recovery":
      return disasterRecoverySnapshot(query);
    case "settings":
      return settingsSnapshot(query);
    case "feature-flags":
      return featureFlagsSnapshot(query);
    case "announcements":
      return announcementsSnapshot(query);
    case "api-usage":
      return apiUsageSnapshot(query);
    case "webhooks":
      return webhooksSnapshot(query);
    case "platform-settings":
      return platformSettingsSnapshot(query);
  }
}

async function billingSnapshot(query: SnapshotQuery) {
  const where: Prisma.PaymentWhereInput = {
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.search ? { company: { name: { contains: query.search, mode: "insensitive" } } } : {}),
    ...dateWhere("createdAt", query),
  };
  const [payments, total, grouped, invoiceCount, activeSubscriptions, trialSubscriptions] = await Promise.all([
    prisma.payment.findMany({
      where,
      select: {
        id: true,
        status: true,
        provider: true,
        paymentMethod: true,
        amount: true,
        currency: true,
        paidAt: true,
        failedAt: true,
        createdAt: true,
        company: { select: { id: true, name: true } },
        plan: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: offset(query),
      take: query.limit,
    }),
    prisma.payment.count({ where }),
    prisma.payment.groupBy({
      by: ["currency", "status"],
      where: { ...where, status: { in: ["PAID", "SUCCEEDED", "MANUALLY_CONFIRMED"] } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.invoice.count(),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.subscription.count({ where: { status: "TRIALING" } }),
  ]);
  const revenueByCurrency = grouped.reduce<Record<string, number>>((result, row) => {
    result[row.currency] = (result[row.currency] ?? 0) + Number(row._sum.amount ?? 0);
    return result;
  }, {});
  const metrics: Record<string, SnapshotValue> = {
    activeSubscriptions,
    trialSubscriptions,
    invoices: invoiceCount,
    payments: total,
  };
  for (const [currency, amount] of Object.entries(revenueByCurrency)) metrics[`revenue_${currency}`] = amount;
  return snapshot("billing", query, total, metrics, payments.map((payment) => ({
    id: payment.id,
    title: payment.company.name,
    subtitle: payment.plan?.name ?? payment.paymentMethod,
    status: payment.status,
    createdAt: payment.createdAt.toISOString(),
    fields: {
      companyId: payment.company.id,
      amount: Number(payment.amount),
      currency: payment.currency,
      provider: payment.provider,
      paymentMethod: payment.paymentMethod,
      paidAt: iso(payment.paidAt),
      failedAt: iso(payment.failedAt),
    },
  })), ["status", "companyId", "dateFrom", "dateTo"]);
}

async function whatsappAccountsSnapshot(query: SnapshotQuery) {
  const where: Prisma.WhatsAppAccountWhereInput = {
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.search ? {
      OR: [
        { label: { contains: query.search, mode: "insensitive" } },
        { phoneNumber: { contains: query.search } },
        { displayName: { contains: query.search, mode: "insensitive" } },
        { company: { name: { contains: query.search, mode: "insensitive" } } },
        { user: { email: { contains: query.search, mode: "insensitive" } } },
      ],
    } : {}),
    ...dateWhere("createdAt", query),
  };
  const [accounts, total, statusCounts] = await Promise.all([
    prisma.whatsAppAccount.findMany({
      where,
      select: {
        id: true,
        label: true,
        phoneNumber: true,
        displayName: true,
        status: true,
        healthScore: true,
        reconnectRetryCount: true,
        lastConnectedAt: true,
        lastSyncedAt: true,
        lastGroupSyncAt: true,
        lastContactSyncAt: true,
        lastHeartbeatAt: true,
        sessionRestoredAt: true,
        sessionSnapshotAt: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
        company: { select: { id: true, name: true } },
        user: { select: { email: true, name: true } },
        _count: { select: { groups: true, contacts: true, recipients: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: offset(query),
      take: query.limit,
    }),
    prisma.whatsAppAccount.count({ where }),
    prisma.whatsAppAccount.groupBy({ by: ["status"], where, _count: { _all: true } }),
  ]);
  const metrics: Record<string, SnapshotValue> = { total };
  for (const row of statusCounts) metrics[`status_${row.status}`] = row._count._all;
  return snapshot("whatsapp-accounts", query, total, metrics, accounts.map((account) => ({
    id: account.id,
    title: account.displayName || account.label || account.phoneNumber || account.id,
    subtitle: `${account.company.name} · ${account.user?.email || "-"}`,
    status: account.archivedAt ? "ARCHIVED" : account.status,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
    fields: {
      companyId: account.company.id,
      phone: maskPhone(account.phoneNumber),
      owner: account.user?.email ?? null,
      healthScore: account.healthScore,
      reconnectAttempts: account.reconnectRetryCount,
      groups: account._count.groups,
      contacts: account._count.contacts,
      deliveries: account._count.recipients,
      lastConnectedAt: iso(account.lastConnectedAt),
      lastSyncedAt: iso(account.lastSyncedAt),
      lastGroupSyncAt: iso(account.lastGroupSyncAt),
      lastContactSyncAt: iso(account.lastContactSyncAt),
      lastHeartbeatAt: iso(account.lastHeartbeatAt),
      sessionRestoredAt: iso(account.sessionRestoredAt),
      snapshotAvailable: Boolean(account.sessionSnapshotAt),
      archived: Boolean(account.archivedAt),
    },
  })), ["status", "companyId", "dateFrom", "dateTo"]);
}

async function campaignsSnapshot(query: SnapshotQuery) {
  const where: Prisma.MessageCampaignWhereInput = {
    deletedAt: null,
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.search ? {
      OR: [
        { title: { contains: query.search, mode: "insensitive" } },
        { company: { name: { contains: query.search, mode: "insensitive" } } },
        { createdBy: { email: { contains: query.search, mode: "insensitive" } } },
      ],
    } : {}),
    ...dateWhere("createdAt", query),
  };
  const [campaigns, total, statusCounts] = await Promise.all([
    prisma.messageCampaign.findMany({
      where,
      select: {
        id: true,
        title: true,
        type: true,
        scheduleType: true,
        status: true,
        scheduledAt: true,
        totalRecipients: true,
        sentCount: true,
        failedCount: true,
        canceledCount: true,
        deleteForEveryoneStatus: true,
        createdAt: true,
        updatedAt: true,
        company: { select: { id: true, name: true } },
        createdBy: { select: { email: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: offset(query),
      take: query.limit,
    }),
    prisma.messageCampaign.count({ where }),
    prisma.messageCampaign.groupBy({ by: ["status"], where, _count: { _all: true } }),
  ]);
  const metrics: Record<string, SnapshotValue> = { total };
  for (const row of statusCounts) metrics[`status_${row.status}`] = row._count._all;
  return snapshot("campaigns", query, total, metrics, campaigns.map((campaign) => ({
    id: campaign.id,
    title: campaign.title,
    subtitle: `${campaign.company.name} · ${campaign.createdBy.email}`,
    status: campaign.status,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
    fields: {
      companyId: campaign.company.id,
      type: campaign.type,
      scheduleType: campaign.scheduleType,
      scheduledAt: iso(campaign.scheduledAt),
      targets: campaign.totalRecipients,
      sent: campaign.sentCount,
      failed: campaign.failedCount,
      canceled: campaign.canceledCount,
      deleteForEveryoneStatus: campaign.deleteForEveryoneStatus,
    },
  })), ["status", "companyId", "dateFrom", "dateTo"]);
}

async function complianceSnapshot(query: SnapshotQuery) {
  const consentWhere: Prisma.ConsentRecordWhereInput = query.search ? {
    user: { OR: [{ email: { contains: query.search, mode: "insensitive" } }, { name: { contains: query.search, mode: "insensitive" } }] },
  } : {};
  const [consents, total, requestCount, pendingCount, deletionCount] = await Promise.all([
    prisma.consentRecord.findMany({
      where: consentWhere,
      select: { id: true, type: true, version: true, granted: true, createdAt: true, user: { select: { email: true, name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: offset(query),
      take: query.limit,
    }),
    prisma.consentRecord.count({ where: consentWhere }),
    prisma.dataSubjectRequest.count(),
    prisma.dataSubjectRequest.count({ where: { status: { in: ["REQUESTED", "VERIFYING", "PROCESSING"] } } }),
    prisma.dataSubjectRequest.count({ where: { type: "DELETION" } }),
  ]);
  return snapshot("compliance", query, total, { consents: total, dataRequests: requestCount, pendingRequests: pendingCount, deletionRequests: deletionCount }, consents.map((consent) => ({
    id: consent.id,
    title: consent.user.name || consent.user.email,
    subtitle: consent.user.email,
    status: consent.granted ? "GRANTED" : "REJECTED",
    createdAt: consent.createdAt.toISOString(),
    fields: { type: consent.type, version: consent.version, granted: consent.granted },
  })), ["dateFrom", "dateTo"], true, "Compliance records are immutable in the administrator client.");
}

async function auditSnapshot(query: SnapshotQuery) {
  const where: Prisma.AuditLogWhereInput = {
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.search ? {
      OR: [
        { action: { contains: query.search, mode: "insensitive" } },
        { entityType: { contains: query.search, mode: "insensitive" } },
        { company: { name: { contains: query.search, mode: "insensitive" } } },
        { user: { email: { contains: query.search, mode: "insensitive" } } },
      ],
    } : {}),
    ...dateWhere("createdAt", query),
  };
  const [logs, total, adminAccess, sensitiveAccess] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: { id: true, action: true, entityType: true, entityId: true, createdAt: true, company: { select: { id: true, name: true } }, user: { select: { email: true, name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: offset(query),
      take: query.limit,
    }),
    prisma.auditLog.count({ where }),
    prisma.adminAccessLog.count(),
    prisma.adminAccessLog.count({ where: { sensitive: true } }),
  ]);
  return snapshot("audit", query, total, { auditEvents: total, adminAccess, sensitiveAccess }, logs.map((log) => ({
    id: log.id,
    title: log.action,
    subtitle: `${log.entityType}${log.entityId ? ` · ${log.entityId}` : ""}`,
    createdAt: log.createdAt.toISOString(),
    fields: { actor: log.user?.email ?? "SYSTEM", companyId: log.company.id, company: log.company.name, targetType: log.entityType, targetId: log.entityId ?? null },
  })), ["companyId", "dateFrom", "dateTo"], true, "Audit records cannot be edited or deleted.");
}

async function notificationsSnapshot(query: SnapshotQuery) {
  const where: Prisma.NotificationWhereInput = {
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.status === "READ" ? { isRead: true } : query.status === "UNREAD" ? { isRead: false } : {}),
    ...(query.search ? {
      OR: [
        { title: { contains: query.search, mode: "insensitive" } },
        { message: { contains: query.search, mode: "insensitive" } },
        { type: { contains: query.search, mode: "insensitive" } },
        { user: { email: { contains: query.search, mode: "insensitive" } } },
      ],
    } : {}),
    ...dateWhere("createdAt", query),
  };
  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      select: { id: true, type: true, title: true, message: true, isRead: true, createdAt: true, company: { select: { id: true, name: true } }, user: { select: { email: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: offset(query),
      take: query.limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...where, isRead: false } }),
  ]);
  return snapshot("notifications", query, total, { total, unread }, rows.map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: row.message,
    status: row.isRead ? "READ" : "UNREAD",
    createdAt: row.createdAt.toISOString(),
    fields: { type: row.type, companyId: row.company.id, company: row.company.name, user: row.user.email },
  })), ["status", "companyId", "dateFrom", "dateTo"], true, "Global notification mutations are not available in the current backend.");
}

async function dataRequestsSnapshot(query: SnapshotQuery) {
  const where: Prisma.DataSubjectRequestWhereInput = {
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.search ? {
      OR: [
        { user: { email: { contains: query.search, mode: "insensitive" } } },
        { company: { name: { contains: query.search, mode: "insensitive" } } },
      ],
    } : {}),
    ...dateWhere("requestedAt", query),
  };
  const [rows, total, pending, completed, deletions] = await Promise.all([
    prisma.dataSubjectRequest.findMany({
      where,
      select: { id: true, type: true, status: true, requestedAt: true, completedAt: true, company: { select: { id: true, name: true } }, user: { select: { email: true, name: true } } },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      skip: offset(query),
      take: query.limit,
    }),
    prisma.dataSubjectRequest.count({ where }),
    prisma.dataSubjectRequest.count({ where: { ...where, status: { in: ["REQUESTED", "VERIFYING", "PROCESSING"] } } }),
    prisma.dataSubjectRequest.count({ where: { ...where, status: "COMPLETED" } }),
    prisma.dataSubjectRequest.count({ where: { ...where, type: "DELETION" } }),
  ]);
  return snapshot("data-requests", query, total, { total, pending, completed, deletions }, rows.map((row) => ({
    id: row.id,
    title: row.user?.name || row.user?.email || row.company?.name || row.id,
    subtitle: row.company?.name ?? row.user?.email ?? null,
    status: row.status,
    createdAt: row.requestedAt.toISOString(),
    fields: { type: row.type, user: row.user?.email ?? null, companyId: row.company?.id ?? null, company: row.company?.name ?? null, completedAt: iso(row.completedAt) },
  })), ["status", "companyId", "dateFrom", "dateTo"], true, "Data request decisions require a dedicated legal workflow that is not implemented yet.");
}

async function featureFlagsSnapshot(query: SnapshotQuery) {
  const where: Prisma.FeatureFlagWhereInput = query.search ? {
    OR: [{ key: { contains: query.search, mode: "insensitive" } }, { name: { contains: query.search, mode: "insensitive" } }],
  } : {};
  const [rows, total, enabled] = await Promise.all([
    prisma.featureFlag.findMany({ where, orderBy: [{ key: "asc" }, { id: "asc" }], skip: offset(query), take: query.limit }),
    prisma.featureFlag.count({ where }),
    prisma.featureFlag.count({ where: { ...where, isEnabled: true } }),
  ]);
  return snapshot("feature-flags", query, total, { total, enabled, disabled: total - enabled }, rows.map((row) => ({
    id: row.id,
    title: row.name,
    subtitle: row.description,
    status: row.isEnabled ? "ENABLED" : "DISABLED",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    fields: { key: row.key, rolloutPercentage: row.rolloutPercentage },
  })), [], true, "Feature flag changes require an audited mutation that is not available yet.");
}

async function announcementsSnapshot(query: SnapshotQuery) {
  const where: Prisma.AnnouncementWhereInput = {
    ...(query.status === "ACTIVE" ? { isActive: true } : query.status === "INACTIVE" ? { isActive: false } : {}),
    ...(query.search ? { OR: [{ title: { contains: query.search, mode: "insensitive" } }, { message: { contains: query.search, mode: "insensitive" } }] } : {}),
    ...dateWhere("startsAt", query),
  };
  const [rows, total, active] = await Promise.all([
    prisma.announcement.findMany({ where, orderBy: [{ startsAt: "desc" }, { id: "desc" }], skip: offset(query), take: query.limit }),
    prisma.announcement.count({ where }),
    prisma.announcement.count({ where: { ...where, isActive: true } }),
  ]);
  return snapshot("announcements", query, total, { total, active, inactive: total - active }, rows.map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: row.message,
    status: row.isActive ? "ACTIVE" : "INACTIVE",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    fields: { type: row.type, startsAt: row.startsAt.toISOString(), endsAt: iso(row.endsAt) },
  })), ["status", "dateFrom", "dateTo"], true, "Announcement publishing does not yet have a validated administrator mutation.");
}

async function apiUsageSnapshot(query: SnapshotQuery) {
  const where: Prisma.ApiUsageLogWhereInput = {
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.status ? { statusCode: Number(query.status) || undefined } : {}),
    ...(query.search ? { OR: [{ path: { contains: query.search, mode: "insensitive" } }, { method: { contains: query.search, mode: "insensitive" } }, { company: { name: { contains: query.search, mode: "insensitive" } } }] } : {}),
    ...dateWhere("createdAt", query),
  };
  const [rows, total, aggregate, errors, activeKeys] = await Promise.all([
    prisma.apiUsageLog.findMany({
      where,
      select: { id: true, method: true, path: true, statusCode: true, latencyMs: true, abuseScore: true, createdAt: true, company: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: offset(query),
      take: query.limit,
    }),
    prisma.apiUsageLog.count({ where }),
    prisma.apiUsageLog.aggregate({ where, _avg: { latencyMs: true } }),
    prisma.apiUsageLog.count({ where: { ...where, statusCode: { gte: 400 } } }),
    prisma.apiKey.count({ where: { revokedAt: null } }),
  ]);
  return snapshot("api-usage", query, total, { requests: total, errors, averageLatencyMs: Math.round(aggregate._avg.latencyMs ?? 0), activeKeys }, rows.map((row) => ({
    id: row.id,
    title: `${row.method} ${row.path}`,
    subtitle: row.company.name,
    status: String(row.statusCode),
    createdAt: row.createdAt.toISOString(),
    fields: { companyId: row.company.id, latencyMs: row.latencyMs, abuseScore: row.abuseScore },
  })), ["status", "companyId", "dateFrom", "dateTo"], true, "API usage logs are immutable.");
}

async function webhooksSnapshot(query: SnapshotQuery) {
  const where: Prisma.WebhookEndpointWhereInput = {
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.status === "ACTIVE" ? { isActive: true } : query.status === "INACTIVE" ? { isActive: false } : {}),
    ...(query.search ? { company: { name: { contains: query.search, mode: "insensitive" } } } : {}),
  };
  const [rows, total, active, failed, dead] = await Promise.all([
    prisma.webhookEndpoint.findMany({
      where,
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        company: { select: { id: true, name: true } },
        deliveries: { select: { status: true, attemptCount: true, responseStatus: true, deliveredAt: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: offset(query),
      take: query.limit,
    }),
    prisma.webhookEndpoint.count({ where }),
    prisma.webhookEndpoint.count({ where: { ...where, isActive: true } }),
    prisma.webhookDelivery.count({ where: { status: "FAILED", endpoint: where } }),
    prisma.webhookDelivery.count({ where: { status: "DEAD_LETTER", endpoint: where } }),
  ]);
  return snapshot("webhooks", query, total, { endpoints: total, active, failedDeliveries: failed, deadLetterDeliveries: dead }, rows.map((row) => ({
    id: row.id,
    title: row.company.name,
    subtitle: safeOrigin(row.url),
    status: row.isActive ? "ACTIVE" : "INACTIVE",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    fields: { companyId: row.company.id, eventCount: row.events.length, lastDelivery: row.deliveries[0]?.status ?? null, lastResponseStatus: row.deliveries[0]?.responseStatus ?? null, lastDeliveredAt: iso(row.deliveries[0]?.deliveredAt) },
  })), ["status", "companyId"], true, "Webhook mutations and secret rotation require a dedicated audited workflow.");
}

async function backupsSnapshot(query: SnapshotQuery) {
  const provider = process.env.BACKUP_STORAGE_PROVIDER || null;
  const configured = Boolean(provider);
  return snapshot("backups", query, 3, { providerConfigured: configured, restoreWorkflowAvailable: false }, [
    systemItem("database-backup", "Database backup", configured ? "CONFIGURED" : "UNKNOWN", { provider: provider ?? "NOT_CONFIGURED", verification: "UNKNOWN" }),
    systemItem("file-backup", "File backup", configured ? "CONFIGURED" : "UNKNOWN", { provider: provider ?? "NOT_CONFIGURED", verification: "UNKNOWN" }),
    systemItem("restore-readiness", "Restore readiness", "RUNBOOK_ONLY", { runbook: "docs/backup-and-disaster-recovery.md", mobileRestoreAllowed: false }),
  ], [], true, "No backup execution or verified restore API exists in the current backend.");
}

async function disasterRecoverySnapshot(query: SnapshotQuery) {
  const provider = process.env.BACKUP_STORAGE_PROVIDER || null;
  return snapshot("disaster-recovery", query, 4, { rpoHours: 24, rtoHours: 4, dailyRetentionDays: 7, monthlyRetentionMonths: 12 }, [
    systemItem("recovery-plan", "Recovery plan", "DOCUMENTED", { runbook: "docs/backup-and-disaster-recovery.md" }),
    systemItem("backup-provider", "Backup provider", provider ? "CONFIGURED" : "UNKNOWN", { provider: provider ?? "NOT_CONFIGURED" }),
    systemItem("recovery-test", "Latest recovery test", "UNKNOWN", { result: "NOT_RECORDED" }),
    systemItem("mobile-execution", "Mobile recovery execution", "UNAVAILABLE", { reason: "No protected recovery execution API exists." }),
  ], [], true, "Recovery execution is intentionally unavailable without a protected backend workflow.");
}

async function settingsSnapshot(query: SnapshotQuery) {
  const rows = [
    systemItem("maintenance", "Maintenance mode", envBoolean("MAINTENANCE_MODE") ? "ENABLED" : "DISABLED", { configured: process.env.MAINTENANCE_MODE != null }),
    systemItem("email", "Email provider", process.env.EMAIL_PROVIDER ? "CONFIGURED" : "UNKNOWN", { provider: process.env.EMAIL_PROVIDER || "NOT_CONFIGURED" }),
    systemItem("backups", "Backup provider", process.env.BACKUP_STORAGE_PROVIDER ? "CONFIGURED" : "UNKNOWN", { provider: process.env.BACKUP_STORAGE_PROVIDER || "NOT_CONFIGURED" }),
    systemItem("registration", "Public registration", envBoolean("PUBLIC_REGISTRATION_DISABLED") ? "DISABLED" : "ENABLED", {}),
  ];
  return snapshot("settings", query, rows.length, { supportedLocales: locales.length, maintenanceMode: envBoolean("MAINTENANCE_MODE") }, rows, [], true, "Operational settings are environment-managed in the current deployment.");
}

async function platformSettingsSnapshot(query: SnapshotQuery) {
  const plans = await prisma.plan.findMany({
    where: { slug: { in: [...CORE_PLAN_CODES] } },
    select: { id: true, slug: true, name: true, currency: true, trialDays: true, isActive: true, maxWhatsappAccounts: true, maxTeamUsers: true, updatedAt: true },
    orderBy: { monthlyPrice: "asc" },
  });
  const items = plans.map((plan) => ({
    id: plan.id,
    title: plan.name,
    subtitle: plan.slug,
    status: plan.isActive ? "ACTIVE" : "INACTIVE",
    updatedAt: plan.updatedAt.toISOString(),
    fields: {
      currency: plan.currency,
      trialDays: plan.trialDays,
      whatsappAccounts: plan.maxWhatsappAccounts,
      teamSeats: CORE_PLAN_MATRIX[plan.slug as keyof typeof CORE_PLAN_MATRIX]?.totalUserSeats ?? plan.maxTeamUsers,
    },
  }));
  return snapshot("platform-settings", query, items.length, {
    plans: items.length,
    supportedLocales: locales.length,
    supportedCurrencies: 1,
    maintenanceMode: envBoolean("MAINTENANCE_MODE"),
    publicRegistration: !envBoolean("PUBLIC_REGISTRATION_DISABLED"),
  }, items, [], true, "Platform configuration is managed by backend configuration and audited deployment changes.");
}

function snapshot(
  module: AdminSnapshotModule,
  query: SnapshotQuery,
  total: number,
  metrics: Record<string, SnapshotValue>,
  items: AdminSnapshotItem[],
  filters: string[],
  readOnly = true,
  readOnlyReason?: string,
): AdminModuleSnapshot {
  const pages = Math.max(1, Math.ceil(total / query.limit));
  return {
    module,
    generatedAt: new Date().toISOString(),
    metrics,
    items,
    pagination: { page: query.page, limit: query.limit, total, pages, nextPage: query.page < pages ? query.page + 1 : null },
    capabilities: {
      search: ["billing", "whatsapp-accounts", "campaigns", "compliance", "audit", "notifications", "data-requests", "feature-flags", "announcements", "api-usage", "webhooks"].includes(module),
      filters,
      actions: [],
      readOnly,
      ...(readOnlyReason ? { readOnlyReason } : {}),
    },
  };
}

function systemItem(id: string, title: string, status: string, fields: Record<string, SnapshotValue>): AdminSnapshotItem {
  return { id, title, status, fields };
}

function offset(query: SnapshotQuery) {
  return (query.page - 1) * query.limit;
}

function dateWhere(field: string, query: SnapshotQuery) {
  if (!query.dateFrom && !query.dateTo) return {};
  return {
    [field]: {
      ...(query.dateFrom ? { gte: query.dateFrom } : {}),
      ...(query.dateTo ? { lte: query.dateTo } : {}),
    },
  };
}

function parseDate(value: string | null, endOfDay: boolean) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCHours(23, 59, 59, 999);
  return date;
}

function clampInteger(value: string | null, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function iso(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function maskPhone(value?: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return `***${digits}`;
  return `+${digits.slice(0, 2)} *** *** ${digits.slice(-4)}`;
}

function safeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "INVALID_URL";
  }
}

function envBoolean(key: string) {
  return process.env[key]?.trim().toLowerCase() === "true";
}
