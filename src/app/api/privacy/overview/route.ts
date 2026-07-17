import { PRIVACY_POLICY_VERSION, PRIVACY_PURPOSES } from "@/server/privacy/catalog";
import { requirePrivacyAuth } from "@/server/privacy/auth";
import { privacyErrorResponse } from "@/server/privacy/errors";
import { prisma } from "@/server/db";
import { userPrivacyExportSelect, userPrivacyRequestSummarySelect } from "@/server/privacy/serialization";

export async function GET(request: Request) {
  try {
    const context = await requirePrivacyAuth(request);
    const [consents, requests, exports, deletions] = await Promise.all([
      prisma.consentRecord.findMany({ where: { userId: context.user.id, OR: [{ companyId: context.company.id }, { companyId: null }] }, orderBy: { collectedAt: "desc" } }),
      prisma.dataSubjectRequest.findMany({ where: { userId: context.user.id, companyId: context.company.id }, select: userPrivacyRequestSummarySelect, orderBy: { requestedAt: "desc" }, take: 50 }),
      prisma.privacyExportJob.findMany({ where: { userId: context.user.id, companyId: context.company.id }, select: userPrivacyExportSelect, orderBy: { createdAt: "desc" }, take: 10 }),
      prisma.privacyDeletionJob.findMany({ where: { userId: context.user.id, companyId: context.company.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
    const latest = new Map<string, (typeof consents)[number]>();
    for (const consent of consents) if (!latest.has(consent.purposeCode)) latest.set(consent.purposeCode, consent);
    return Response.json({
      legalReviewStatus: "LEGAL_REVIEW_REQUIRED",
      policyVersion: PRIVACY_POLICY_VERSION,
      purposes: PRIVACY_PURPOSES.map((purpose) => ({ ...purpose, currentStatus: latest.get(purpose.code)?.status ?? (purpose.required ? "NOT_REQUIRED" : "PENDING") })),
      requests,
      exports: exports.map((job) => ({ ...job, sizeBytes: job.sizeBytes?.toString() ?? null })),
      deletions,
    });
  } catch (error) {
    return privacyErrorResponse(error);
  }
}
