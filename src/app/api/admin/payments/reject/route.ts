import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({ paymentId: z.string(), reason: z.string().trim().min(5).max(500) });

export async function POST(request: Request) {
  try {
    const { user } = await requirePlatformAdmin("admin.payments.confirm", request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    const payment = await prisma.payment.findUnique({
      where: { id: parsed.data.paymentId },
      select: { id: true, companyId: true, status: true, company: { select: { ownerId: true } } },
    });
    if (!payment) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (payment.status === "FAILED") return NextResponse.json({ payment, idempotent: true });
    if (payment.status === "PAID" || payment.status === "SUCCEEDED") return NextResponse.json({ error: "PAID_PAYMENT_CANNOT_BE_REJECTED" }, { status: 409 });

    const rejected = await prisma.$transaction(async (transaction) => {
      const result = await transaction.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", failureReason: parsed.data.reason },
        select: { id: true, status: true, failureReason: true },
      });
      await transaction.notification.create({
        data: {
          companyId: payment.companyId,
          userId: payment.company.ownerId,
          type: "PAYMENT_REJECTED",
          title: "Ödeme talebi reddedildi",
          message: parsed.data.reason,
        },
      });
      return result;
    });
    await writeAuditLog(request, {
      companyId: payment.companyId,
      userId: user.id,
      action: "payment.rejected",
      entityType: "Payment",
      entityId: payment.id,
      before: { status: payment.status },
      after: { status: rejected.status, reason: parsed.data.reason },
    });
    return NextResponse.json({ payment: rejected });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "FORBIDDEN" }, { status: 403 });
  }
}
