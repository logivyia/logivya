import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { isBillingProfileComplete } from "@/server/billing/subscription-guard";
import { writeAuditLog } from "@/server/security/audit";
import { requestId, safeAdminError } from "@/server/security/admin-request";

const schema = z.object({
  paymentId: z.string(),
  note: z.string().trim().min(5).max(500),
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
      parsed.data.note,
    );
    const payment = await prisma.payment.findUnique({
      where: { id: parsed.data.paymentId },
      include: {
        invoice: true,
        subscription: true,
        company: { include: { billingProfile: true } },
      },
    });
    if (!payment)
      return NextResponse.json(
        { error: "NOT_FOUND", requestId: id },
        { status: 404 },
      );
    if (["PAID", "SUCCEEDED", "MANUALLY_CONFIRMED"].includes(payment.status)) {
      return NextResponse.json({ payment, idempotent: true, requestId: id });
    }
    if (payment.status !== "PENDING") {
      return NextResponse.json(
        { error: "PAYMENT_NOT_ACTIONABLE", requestId: id },
        { status: 409 },
      );
    }
    const profile = payment.company.billingProfile;
    if (!isBillingProfileComplete(profile)) {
      return NextResponse.json(
        { error: "billing.profileIncomplete", requestId: id },
        { status: 400 },
      );
    }
    const currentMetadata =
      payment.metadata &&
      typeof payment.metadata === "object" &&
      !Array.isArray(payment.metadata)
        ? payment.metadata
        : {};
    const result = await prisma.$transaction(async (tx) => {
      const claim = await tx.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: {
          status: "PAID",
          paidAt: new Date(),
          failureReason: null,
          metadata: { ...currentMetadata, adminMarkPaidNote: parsed.data.note },
        },
      });
      if (claim.count !== 1) {
        const current = await tx.payment.findUnique({
          where: { id: payment.id },
        });
        return { kind: "not-claimed" as const, current };
      }

      let invoice = payment.invoice;
      if (!invoice) {
        invoice = await tx.invoice.create({
          data: {
            companyId: payment.companyId,
            subscriptionId: payment.subscriptionId,
            invoiceType: profile!.invoiceType,
            status: "DRAFT",
            currency: payment.currency,
            subtotalAmount: payment.amount,
            taxAmount: 0,
            totalAmount: payment.amount,
            billingName:
              profile!.billingType === "COMPANY"
                ? profile!.legalName!
                : profile!.fullName!,
            billingTaxOffice: profile!.taxOffice,
            billingTaxNumber: profile!.taxNumber || profile!.nationalIdNumber,
            billingAddress: [
              profile!.addressLine1,
              profile!.addressLine2,
              profile!.district,
              profile!.city,
              profile!.country,
            ]
              .filter(Boolean)
              .join(", "),
            billingEmail: profile!.billingEmail,
            provider: "MANUAL",
            metadata: { paymentId: payment.id },
          },
        });
      }
      const paid = await tx.payment.update({
        where: { id: payment.id },
        data: { invoiceId: invoice.id },
      });
      if (payment.subscriptionId) {
        await tx.subscriptionEvent.createMany({
          data: [
            {
              companyId: payment.companyId,
              subscriptionId: payment.subscriptionId,
              actorUserId: user.id,
              type: "PAYMENT_RECEIVED",
              message: "Ödeme alındı olarak işaretlendi.",
              metadata: { paymentId: payment.id },
            },
            {
              companyId: payment.companyId,
              subscriptionId: payment.subscriptionId,
              actorUserId: user.id,
              type: "INVOICE_CREATED",
              message: "Taslak fatura oluşturuldu.",
              metadata: { invoiceId: invoice.id },
            },
          ],
        });
      }
      await tx.notification.create({
        data: {
          companyId: payment.companyId,
          userId: payment.company.ownerId,
          type: "PAYMENT_RECEIVED",
          title: "Ödemeniz alındı",
          message: `${payment.amount} ${payment.currency} ödemeniz kaydedildi.`,
        },
      });
      return { kind: "updated" as const, payment: paid, invoice };
    });

    if (result.kind === "not-claimed") {
      if (
        result.current &&
        ["PAID", "SUCCEEDED", "MANUALLY_CONFIRMED"].includes(
          result.current.status,
        )
      ) {
        return NextResponse.json({
          payment: result.current,
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
      action: "payment.marked_paid",
      entityType: "Payment",
      entityId: payment.id,
      before: { status: payment.status },
      after: {
        status: result.payment.status,
        invoiceId: result.invoice.id,
        note: parsed.data.note,
      },
    });
    return NextResponse.json({
      payment: result.payment,
      invoice: result.invoice,
      requestId: id,
    });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
