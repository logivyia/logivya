import { NextResponse } from "next/server";

import { adminAuditPrivacyWhere } from "@/server/admin/message-privacy";
import { serializeAdminAuditRecord } from "@/server/admin/message-privacy-contract";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { writeAuditLog } from "@/server/security/audit";
import { requestId, safeAdminError } from "@/server/security/admin-request";

function boundedInteger(
  value: string | null,
  fallback: number,
  maximum: number,
) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

function validDate(value: string | null, endOfDay = false) {
  if (!value) return undefined;
  const date = new Date(
    endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T23:59:59.999Z`
      : value,
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET(request: Request) {
  try {
    const context = await requirePlatformAdmin("admin.audit.read", request);
    const params = new URL(request.url).searchParams;
    const page = boundedInteger(params.get("page"), 1, 10_000);
    const limit = boundedInteger(params.get("limit"), 50, 100);
    const search = params.get("q")?.trim().slice(0, 120) || "";
    const companyId = params.get("companyId")?.trim().slice(0, 128) || "";
    const userId = params.get("userId")?.trim().slice(0, 128) || "";
    const action = params.get("action")?.trim().slice(0, 120) || "";
    const result = params.get("result")?.trim().slice(0, 40) || "";
    const actorType = params.get("actorType")?.trim().slice(0, 40) || "";
    const entityType = params.get("entityType")?.trim().slice(0, 120) || "";
    const dateFrom = validDate(params.get("dateFrom"));
    const dateTo = validDate(params.get("dateTo"), true);

    const where = adminAuditPrivacyWhere({
      ...(companyId ? { companyId } : {}),
      ...(userId ? { userId } : {}),
      ...(action ? { action } : {}),
      ...(result ? { result } : {}),
      ...(actorType ? { actorType } : {}),
      ...(entityType ? { entityType } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { action: { contains: search, mode: "insensitive" } },
              { entityType: { contains: search, mode: "insensitive" } },
              { company: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    });

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          actorType: true,
          actorEmailMasked: true,
          action: true,
          result: true,
          entityType: true,
          entityId: true,
          clientPlatform: true,
          appVersion: true,
          createdAt: true,
          company: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    void writeAuditLog(request, {
      companyId: context.company.id,
      userId: context.user.id,
      actorType: "PLATFORM_ADMIN",
      actorEmail: context.user.email,
      action: "ADMIN_AUDIT_LOG_ACCESSED",
      result: "SUCCESS",
      entityType: "AuditLog",
      metadata: {
        filtersApplied: Boolean(
          search ||
          companyId ||
          userId ||
          action ||
          result ||
          actorType ||
          entityType ||
          dateFrom ||
          dateTo,
        ),
        page,
        limit,
      },
    }).catch((error) =>
      logger.error("audit.admin_audit_access.write_failed", error, {
        userId: context.user.id,
      }),
    );

    return NextResponse.json({
      logs: rows
        .map(serializeAdminAuditRecord)
        .filter((row): row is NonNullable<typeof row> => row !== null),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    logger.error("admin.audit.list_failed", error);
    const safe = safeAdminError(error, requestId(request));
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
