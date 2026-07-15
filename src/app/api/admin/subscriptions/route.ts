import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("admin.billing.read", request);
    const params = new URL(request.url).searchParams;
    const query = params.get("q")?.trim() || "";
    const status = params.get("status")?.trim().toUpperCase();
    const where: Prisma.SubscriptionWhereInput = {
      ...(status ? { status: status as never } : {}),
      ...(query ? {
        OR: [
          { company: { name: { contains: query, mode: "insensitive" } } },
          { company: { email: { contains: query, mode: "insensitive" } } },
          { plan: { name: { contains: query, mode: "insensitive" } } },
          { plan: { slug: { contains: query, mode: "insensitive" } } },
        ],
      } : {}),
    };
    const subscriptions = await prisma.subscription.findMany({
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
      take: 200,
    });
    return NextResponse.json({ subscriptions });
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
}
