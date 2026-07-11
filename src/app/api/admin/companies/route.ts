import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { serializeSubscription } from "@/server/billing/subscription-state";
import { prisma } from "@/server/db";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("admin.companies.read", request);
    const query = new URL(request.url).searchParams.get("q")?.trim();
    const companies = await prisma.company.findMany({
      where: query ? {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } },
          { owner: { name: { contains: query, mode: "insensitive" } } },
          { owner: { email: { contains: query, mode: "insensitive" } } },
          { owner: { phone: { contains: query, mode: "insensitive" } } },
        ],
      } : undefined,
      include: {
        owner: { select: { name: true, email: true, phone: true } },
        billingProfile: true,
        subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      companies: companies.map((company) => ({
        ...company,
        subscriptions: company.subscriptions.map((subscription) => ({
          ...subscription,
          ...serializeSubscription(subscription),
        })),
      })),
    });
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
}
