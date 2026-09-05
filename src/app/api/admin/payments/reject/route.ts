import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";
import { requestId, safeAdminError } from "@/server/security/admin-request";

const schema = z.object({
  paymentId: z.string(),
  reason: z.string().trim().min(5).max(500),
});

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "validation.invalid", requestId: id },
        { status: 400 },
      );
    const { user } = await requireCriticalAdminAction(
      request,
      "admin.payments.confirm",
      parsed.data.reason,
    );
    const payment = await prisma.payment.findUnique({
      where: { id: parsed.data.paymentId },
      select: {
        id: true,
        companyId: true,
        status: true,
        company: { select: { ownerId: true } },
      },
    });
    if (!payment)
      return NextResponse.json(
        { error: "NOT_FOUND", requestId: id },
        { status: 404 },
      );
    if (payment.status === "FAILED" || payment.status === "REJECTED") {
      return NextResponse.json({ payment, idempotent: true, requestId: id });
    }
    if (payment.status !== "PENDING") {
      return NextResponse.json(
        { error: "PAYMENT_NOT_ACTIONABLE", requestId: id },
        { status: 409 },
      );
    }

    const rejected = await prisma.$transaction(async (transaction) => {
      const claim = await transaction.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: { status: "REJECTED", failureReason: parsed.data.reason },
      });
      if (claim.count !== 1) {
        const current = await transaction.payment.findUnique({
          where: { id: payment.id },
        });
        return { kind: "not-claimed" as const, current };
      }
      const result = await transaction.payment.findUniqueOrThrow({
        where: { id: payment.id },
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
      return { kind: "updated" as const, payment: result };
    });

    if (rejected.kind === "not-claimed") {
      if (
        rejected.current?.status === "FAILED" ||
        rejected.current?.status === "REJECTED"
      ) {
        return NextResponse.json({
          payment: rejected.current,
          idempotent: true,
          requestId: id,
        });
      }
      return NextResponse.json(
        { error: "PAYMENT_NOT_ACTIONABLE", requestId: id },
        { status: 409 },
      );
    }

    await writeAuditLog(request, {
      companyId: payment.companyId,
      userId: user.id,
      action: "payment.rejected",
      entityType: "Payment",
      entityId: payment.id,
      before: { status: payment.status },
      after: { status: rejected.payment.status, reason: parsed.data.reason },
    });
    return NextResponse.json({ payment: rejected.payment, requestId: id });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
