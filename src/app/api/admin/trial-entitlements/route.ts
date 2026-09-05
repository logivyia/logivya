import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { requestId, safeAdminError } from "@/server/security/admin-request";

const STATUSES = [
  "PENDING_IDENTITY",
  "ACTIVE",
  "CONSUMED",
  "INELIGIBLE",
  "BLOCKED",
  "PAID_USAGE",
] as const;

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await requirePlatformAdmin("admin.security.read", request);
    const search = new URL(request.url).searchParams;
    const page = positiveInteger(search.get("page"), 1);
    const statusValue = search.get("status");
    const status = STATUSES.find((value) => value === statusValue);
    const where = status ? { status } : {};
    const [items, total, statusGroups] = await Promise.all([
      prisma.trialEntitlement.findMany({
        where,
        include: {
          company: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true } },
          whatsappAccount: {
            select: { id: true, displayName: true, status: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * 50,
        take: 50,
      }),
      prisma.trialEntitlement.count({ where }),
      prisma.trialEntitlement.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
    ]);
    return NextResponse.json({
      items,
      metrics: {
        total,
        ...Object.fromEntries(
          statusGroups.map((group) => [
            `status_${group.status}`,
            group._count._all,
          ]),
        ),
      },
      pagination: { page, total, pages: Math.max(1, Math.ceil(total / 50)) },
      requestId: id,
    });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
