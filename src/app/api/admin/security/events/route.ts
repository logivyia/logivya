import { NextResponse } from "next/server";
import { maskEmail } from "@logivya/logging";

import { adminSecurityEventPrivacyWhere } from "@/server/admin/message-privacy";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { writeAuditLog } from "@/server/security/audit";

const severities = new Set(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const statuses = new Set(["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"]);

function integer(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function date(value: string | null, endOfDay = false) {
  if (!value) return undefined;
  const parsed = new Date(endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function GET(request: Request) {
  try {
    const context = await requirePlatformAdmin("admin.security.read", request);
    const params = new URL(request.url).searchParams;
    const page = integer(params.get("page"), 1, 10_000);
    const limit = integer(params.get("limit"), 50, 100);
    const search = params.get("q")?.trim().slice(0, 120) || "";
    const rawStatus = params.get("status")?.trim().toUpperCase() || "";
    const severity = (params.get("severity")?.trim().toUpperCase() || (severities.has(rawStatus) ? rawStatus : ""));
    const status = (statuses.has(rawStatus) ? rawStatus : params.get("eventStatus")?.trim().toUpperCase() || "");
    const type = params.get("type")?.trim().slice(0, 120) || "";
    const companyId = params.get("companyId")?.trim().slice(0, 128) || "";
    const userId = params.get("userId")?.trim().slice(0, 128) || "";
    const dateFrom = date(params.get("dateFrom"));
    const dateTo = date(params.get("dateTo"), true);
    const since24Hours = new Date(Date.now() - 24 * 60 * 60_000);

    const where = adminSecurityEventPrivacyWhere({
      ...(companyId ? { companyId } : {}),
      ...(userId ? { userId } : {}),
      ...(severity && severities.has(severity) ? { severity: severity as never } : {}),
      ...(status && statuses.has(status) ? { status } : {}),
      ...(type ? { type } : {}),
      ...(dateFrom || dateTo ? { createdAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {}),
      ...(search ? {
        OR: [
          { type: { contains: search, mode: "insensitive" } },
          { source: { contains: search, mode: "insensitive" } },
          { errorCode: { contains: search, mode: "insensitive" } },
          { company: { name: { contains: search, mode: "insensitive" } } },
        ],
      } : {}),
    });

    const [events, total, open, critical, failedLogins, blockedAttempts, mfaEnabledUsers, suspiciousDevices, suspiciousIps, tenantViolations, recentAdminActions] = await Promise.all([
      prisma.securityEvent.findMany({
        where,
        select: {
          id: true,
          severity: true,
          type: true,
          result: true,
          status: true,
          errorCode: true,
          source: true,
          clientPlatform: true,
          appVersion: true,
          ipAddressMasked: true,
          userAgentSummary: true,
          acknowledgedAt: true,
          acknowledgedByUserId: true,
          investigationNote: true,
          createdAt: true,
          resolvedAt: true,
          company: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.securityEvent.count({ where }),
      prisma.securityEvent.count({ where: { status: "OPEN" } }),
      prisma.securityEvent.count({ where: { severity: "CRITICAL", status: { in: ["OPEN", "ACKNOWLEDGED"] } } }),
      prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: since24Hours } } }),
      prisma.rateLimitEvent.count({ where: { blocked: true, createdAt: { gte: since24Hours } } }),
      prisma.mfaCredential.count({ where: { verifiedAt: { not: null }, revokedAt: null } }),
      prisma.securityEvent.count({
        where: {
          createdAt: { gte: since24Hours },
          type: { in: ["AUTH_REFRESH_TOKEN_REPLAY_DETECTED", "AUTH_REFRESH_TOKEN_REJECTED", "AUTH_LOGIN_FAILED"] },
          severity: { in: ["HIGH", "CRITICAL"] },
        },
      }),
      prisma.securityEvent.findMany({
        where: { createdAt: { gte: since24Hours }, severity: { in: ["HIGH", "CRITICAL"] }, ipAddressMasked: { not: null } },
        distinct: ["ipAddressMasked"],
        select: { ipAddressMasked: true },
      }),
      prisma.securityEvent.count({
        where: {
          createdAt: { gte: since24Hours },
          OR: [{ type: { contains: "TENANT", mode: "insensitive" } }, { type: { contains: "IDOR", mode: "insensitive" } }],
        },
      }),
      prisma.auditLog.count({ where: { actorType: "PLATFORM_ADMIN", createdAt: { gte: since24Hours } } }),
    ]);

    void writeAuditLog(request, {
      companyId: context.company.id,
      userId: context.user.id,
      actorType: "PLATFORM_ADMIN",
      actorEmail: context.user.email,
      action: "ADMIN_SECURITY_LOG_ACCESSED",
      result: "SUCCESS",
      entityType: "SecurityEvent",
      metadata: { filtersApplied: Boolean(search || rawStatus || severity || type || companyId || userId || dateFrom || dateTo), page, limit },
    }).catch((error) => logger.error("audit.admin_security_access.write_failed", error, { userId: context.user.id }));

    return NextResponse.json({
      events: events.map((event) => ({
        ...event,
        user: event.user ? { id: event.user.id, name: event.user.name, emailMasked: maskEmail(event.user.email) } : null,
      })),
      metrics: {
        total,
        open,
        critical,
        failedLogins,
        blockedAttempts,
        mfaEnabledUsers,
        suspiciousDevices,
        suspiciousIps: suspiciousIps.length,
        tenantViolations,
        recentAdminActions,
      },
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "FORBIDDEN" || code === "UNAUTHORIZED") return NextResponse.json({ error: code }, { status: code === "UNAUTHORIZED" ? 401 : 403 });
    logger.error("admin.security_events.list_failed", error);
    return NextResponse.json({ error: "SECURITY_EVENTS_LIST_FAILED" }, { status: 500 });
  }
}
