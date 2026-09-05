import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { requestId, safeAdminError } from "@/server/security/admin-request";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await requirePlatformAdmin("admin.billing.read", request);
    const params = new URL(request.url).searchParams;
    const page = positiveInteger(params.get("page"), 1);
    const query = params.get("q")?.trim().slice(0, 120) || "";
    const status = params.get("status")?.trim().toUpperCase();
    const where: Prisma.SubscriptionWhereInput = {
      ...(status &&
      [
        "ACTIVE",
        "TRIALING",
        "EXPIRED",
        "CANCELED",
        "SUSPENDED",
        "MANUAL_PENDING",
      ].includes(status)
        ? { status: status as never }
        : {}),
      ...(query
        ? {
            OR: [
              { company: { name: { contains: query, mode: "insensitive" } } },
              { company: { email: { contains: query, mode: "insensitive" } } },
              { plan: { name: { contains: query, mode: "insensitive" } } },
              { plan: { slug: { contains: query, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const [subscriptions, total, statusGroups] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: {
          company: { select: { id: true, name: true, email: true } },
          plan: true,
          manuallyActivatedBy: { select: { name: true, email: true } },
          events: { orderBy: { createdAt: "desc" }, take: 10 },
          payments: { orderBy: { createdAt: "desc" }, take: 10 },
          invoices: { orderBy: { createdAt: "desc" }, take: 10 },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 30,
        take: 30,
      }),
      prisma.subscription.count({ where }),
      prisma.subscription.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
    ]);
    return NextResponse.json({
      subscriptions,
      metrics: {
        total,
        ...Object.fromEntries(
          statusGroups.map((group) => [
            `status_${group.status}`,
            group._count._all,
          ]),
        ),
      },
      pagination: { page, total, pages: Math.max(1, Math.ceil(total / 30)) },
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
