import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { billingSellerConfigurationState } from "@/server/billing/manual-subscription-config";
import { prisma } from "@/server/db";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";

const nullableText = z.string().trim().max(500).nullable().optional();
const schema = z.object({
  officialName: nullableText,
  registeredAddress: nullableText,
  taxOffice: nullableText,
  taxNumber: nullableText,
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: nullableText,
  tradeRegistryNumber: nullableText,
  tradeRegistryNotApplicable: z.boolean(),
  mersisNumber: nullableText,
  mersisNotApplicable: z.boolean(),
  confirmVerifiedIdentity: z.boolean(),
  confirmLegalApproval: z.boolean(),
  reason: z.string().trim().min(5).max(500),
});

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await requirePlatformAdmin("admin.billing.read", request);
    const configuration = await prisma.billingSellerConfiguration.findUnique({
      where: { id: "logivya" },
    });
    return NextResponse.json({
      configuration,
      state: billingSellerConfigurationState(configuration),
      requestId: id,
    });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}

export async function PATCH(request: Request) {
  const id = requestId(request);
  try {
    const { user, company } = await requirePlatformAdmin("admin.subscriptions.approve", request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", requestId: id }, { status: 400 });
    }
    const { confirmVerifiedIdentity, confirmLegalApproval, reason, ...fields } = parsed.data;
    const before = await prisma.billingSellerConfiguration.findUnique({ where: { id: "logivya" } });
    const configuration = await prisma.billingSellerConfiguration.upsert({
      where: { id: "logivya" },
      create: {
        id: "logivya",
        ...fields,
        verifiedAt: confirmVerifiedIdentity ? new Date() : null,
        legalDocumentsApprovedAt: confirmLegalApproval ? new Date() : null,
        updatedByUserId: user.id,
      },
      update: {
        ...fields,
        verifiedAt: confirmVerifiedIdentity ? before?.verifiedAt || new Date() : null,
        legalDocumentsApprovedAt: confirmLegalApproval ? before?.legalDocumentsApprovedAt || new Date() : null,
        updatedByUserId: user.id,
      },
    });
    const state = billingSellerConfigurationState(configuration);
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      actorType: "PLATFORM_ADMIN",
      action: "billing.seller_configuration_updated",
      reason,
      entityType: "BillingSellerConfiguration",
      entityId: configuration.id,
      before: before ? { complete: billingSellerConfigurationState(before).checkoutAvailable } : {},
      after: {
        complete: state.checkoutAvailable,
        missingFields: state.missingFields,
        verified: Boolean(configuration.verifiedAt),
        legalDocumentsApproved: Boolean(configuration.legalDocumentsApprovedAt),
      },
    });
    return NextResponse.json({ configuration, state, requestId: id });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
