import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

const STATUSES = ["PENDING_IDENTITY", "ACTIVE", "CONSUMED", "INELIGIBLE", "BLOCKED", "PAID_USAGE"] as const;

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("admin.security.read", request);
    const search = new URL(request.url).searchParams;
    const page = Math.max(1, Number(search.get("page") || 1));
    const statusValue = search.get("status");
    const status = STATUSES.find((value) => value === statusValue);
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([
      prisma.trialEntitlement.findMany({
        where,
        include: {
          company: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true } },
          whatsappAccount: { select: { id: true, displayName: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * 50,
        take: 50,
      }),
      prisma.trialEntitlement.count({ where }),
    ]);
    return NextResponse.json({ items, pagination: { page, total, pages: Math.ceil(total / 50) } });
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
}
