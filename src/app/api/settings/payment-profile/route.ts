import { NextResponse } from "next/server";

import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { evaluateCheckoutIdentity } from "@/server/billing/checkout-identity";
import { iyzicoPaymentProfileSchema } from "@/server/billing/iyzico-payment-profile-schema";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

function normalizedPhone(value: string) {
  return value.replace(/\s+/gu, "");
}

export async function GET() {
  try {
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "manage_billing");
    const profile = await prisma.companyBillingProfile.findUnique({
      where: { companyId: company.id },
    });
    const personalProfile = profile?.billingType === "INDIVIDUAL" ? profile : null;
    const identity = evaluateCheckoutIdentity({
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: personalProfile?.fullName || user.name,
      email: user.email,
    });
    return NextResponse.json({
      paymentProfile: {
        firstName: identity.customer.firstName,
        lastName: identity.customer.lastName,
        email: user.email,
        phone: personalProfile?.billingPhone || user.phone || "",
        identityNumber: personalProfile?.nationalIdNumber || "",
        addressLine1: personalProfile?.addressLine1 || "",
        addressLine2: personalProfile?.addressLine2 || "",
        city: personalProfile?.city || "",
        district: personalProfile?.district || "",
        postalCode: personalProfile?.postalCode || "",
        country: personalProfile?.country || "TR",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "UNAUTHORIZED" },
      { status: 403 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "manage_billing");
    const parsed = iyzicoPaymentProfileSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation.invalid", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const value = parsed.data;
    const previous = await prisma.companyBillingProfile.findUnique({
      where: { companyId: company.id },
      select: { id: true, billingType: true },
    });
    const profile = await prisma.companyBillingProfile.upsert({
      where: { companyId: company.id },
      create: {
        companyId: company.id,
        billingType: "INDIVIDUAL",
        fullName: `${value.firstName} ${value.lastName}`,
        nationalIdNumber: value.identityNumber,
        country: value.country,
        city: value.city,
        district: value.district ?? null,
        addressLine1: value.addressLine1,
        addressLine2: value.addressLine2 ?? null,
        postalCode: value.postalCode ?? null,
        billingEmail: user.email,
        billingPhone: normalizedPhone(value.phone),
        invoiceType: "STANDARD_INVOICE",
        eInvoiceEligible: false,
        eArchiveEligible: false,
      },
      update: {
        billingType: "INDIVIDUAL",
        fullName: `${value.firstName} ${value.lastName}`,
        companyName: null,
        legalName: null,
        tradeName: null,
        taxOffice: null,
        taxNumber: null,
        nationalIdNumber: value.identityNumber,
        country: value.country,
        city: value.city,
        district: value.district ?? null,
        addressLine1: value.addressLine1,
        addressLine2: value.addressLine2 ?? null,
        postalCode: value.postalCode ?? null,
        billingEmail: user.email,
        billingPhone: normalizedPhone(value.phone),
        invoiceType: "STANDARD_INVOICE",
        eInvoiceEligible: false,
        eArchiveEligible: false,
      },
    });
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "payment.profile.updated",
      entityType: "PaymentProfile",
      entityId: profile.id,
      before: {
        existed: Boolean(previous),
        wasPersonal: previous?.billingType === "INDIVIDUAL",
      },
      after: {
        completed: true,
        clearedLegacyBusinessFields: previous?.billingType === "COMPANY",
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "errors.generic" },
      { status: 403 },
    );
  }
}
