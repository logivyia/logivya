import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { requestId, safeAdminError } from "@/server/security/admin-request";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await requirePlatformAdmin("admin.payments.read", request);
    const params = new URL(request.url).searchParams;
    const page = positiveInteger(params.get("page"), 1);
    const query = params.get("q")?.trim() || "";
    const status = params.get("status")?.trim().toUpperCase();
    const where = {
      ...(status &&
      [
        "PENDING",
        "PAID",
        "SUCCEEDED",
        "FAILED",
        "REFUNDED",
        "MANUALLY_CONFIRMED",
        "REJECTED",
        "CANCELED",
      ].includes(status)
        ? {
            status: status as
              | "PENDING"
              | "PAID"
              | "SUCCEEDED"
              | "FAILED"
              | "REFUNDED"
              | "MANUALLY_CONFIRMED"
              | "REJECTED"
              | "CANCELED",
          }
        : {}),
      ...(query
        ? {
            OR: [
              { id: { contains: query, mode: "insensitive" as const } },
              {
                company: {
                  name: { contains: query, mode: "insensitive" as const },
                },
              },
              {
                plan: {
                  name: { contains: query, mode: "insensitive" as const },
                },
              },
              {
                invoice: {
                  invoiceNumber: {
                    contains: query,
                    mode: "insensitive" as const,
                  },
                },
              },
            ],
          }
        : {}),
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
    return NextResponse.json({
      payments,
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
