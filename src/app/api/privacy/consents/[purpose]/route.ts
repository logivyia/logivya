import { z } from "zod";
import { assertPrivacyMutationCsrf, requirePrivacyAuth } from "@/server/privacy/auth";
import { PrivacyError, privacyErrorResponse } from "@/server/privacy/errors";
import { findPrivacyPurpose, PRIVACY_PREFERENCE_VERSION } from "@/server/privacy/catalog";
import { requestNetworkSummary } from "@/server/observability/privacy";
import { writeAuditLog } from "@/server/security/audit";
import { prisma } from "@/server/db";

const schema = z.object({ enabled: z.boolean(), locale: z.string().trim().min(2).max(12).optional() });

export async function PATCH(request: Request, context: { params: Promise<{ purpose: string }> }) {
  try {
    assertPrivacyMutationCsrf(request);
    const auth = await requirePrivacyAuth(request);
    const { purpose: purposeCode } = await context.params;
    const purpose = findPrivacyPurpose(purposeCode);
    if (!purpose) throw new PrivacyError("PRIVACY_PURPOSE_NOT_FOUND", 404);
    if (purpose.required) throw new PrivacyError("PRIVACY_PURPOSE_NOT_OPTIONAL", 409);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PrivacyError("VALIDATION_INVALID", 400);
    const network = requestNetworkSummary(request);
    const now = new Date();
    const record = await prisma.consentRecord.create({
      data: {
        userId: auth.user.id,
        companyId: auth.company.id,
        type: purpose.consentType,
        purposeCode,
        status: parsed.data.enabled ? "GRANTED" : "WITHDRAWN",
        version: PRIVACY_PREFERENCE_VERSION,
        legalTextVersion: PRIVACY_PREFERENCE_VERSION,
        noticeVersion: PRIVACY_PREFERENCE_VERSION,
        granted: parsed.data.enabled,
        ipAddress: network.ipAddressMasked,
        userAgent: network.userAgentSummary,
        collectionMethod: "PRIVACY_SETTINGS",
        platform: String(auth.platform),
        appVersion: request.headers.get("x-logivya-app-version")?.slice(0, 80),
        locale: parsed.data.locale || auth.user.locale || "tr",
        collectedAt: now,
        withdrawnAt: parsed.data.enabled ? null : now,
        evidence: { preferenceVersion: PRIVACY_PREFERENCE_VERSION, source: "authenticated-privacy-settings" },
      },
    });
    await writeAuditLog(request, { companyId: auth.company.id, userId: auth.user.id, actorEmail: auth.user.email, action: parsed.data.enabled ? "privacy.consent.granted" : "privacy.consent.withdrawn", entityType: "ConsentRecord", entityId: record.id, after: { purposeCode, status: record.status } });
    return Response.json({ consent: record });
  } catch (error) {
    return privacyErrorResponse(error);
  }
}
