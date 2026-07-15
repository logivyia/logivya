import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("admin.payments.read", request);
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number(params.get("page") || 1));
    const query = params.get("q") || "";
    const status = params.get("status")?.trim().toUpperCase();
    const where = {
      ...(status && ["PENDING", "PAID", "SUCCEEDED", "FAILED", "REFUNDED", "MANUALLY_CONFIRMED"].includes(status) ? { status: status as "PENDING" | "PAID" | "SUCCEEDED" | "FAILED" | "REFUNDED" | "MANUALLY_CONFIRMED" } : {}),
      ...(query ? { company: { name: { contains: query, mode: "insensitive" as const } } } : {}),
    };
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        select: {
          id: true,
          status: true,
          paymentMethod: true,
          amount: true,
          currency: true,
          failureReason: true,
          paidAt: true,
          createdAt: true,
          company: { select: { name: true } },
          plan: { select: { name: true } },
          invoice: { select: { invoiceNumber: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * 30,
        take: 30,
      }),
      prisma.payment.count({ where }),
    ]);
    return NextResponse.json({ payments, pagination: { page, total, pages: Math.ceil(total / 30) } });
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
}
