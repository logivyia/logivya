import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { PROCESSOR_REGISTER, INTERNATIONAL_TRANSFER_REGISTER, PRIVACY_RETENTION_POLICY_VERSION } from "@/server/privacy/catalog";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { prisma } from "@/server/db";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await requirePlatformAdmin("admin.privacy.read", request);
    const [requests, exports, deletions, holds, breaches, dpias, retentionRuns] = await Promise.all([
      prisma.dataSubjectRequest.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.privacyExportJob.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.privacyDeletionJob.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.privacyLegalHold.count({ where: { status: "ACTIVE" } }),
      prisma.privacyBreach.count({ where: { status: { not: "CLOSED" } } }),
      prisma.privacyDpia.count({ where: { legalReviewStatus: "LEGAL_REVIEW_REQUIRED" } }),
      prisma.privacyRetentionRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    ]);
    return Response.json({ legalReviewStatus: "LEGAL_REVIEW_REQUIRED", retentionPolicyVersion: PRIVACY_RETENTION_POLICY_VERSION, requests, exports, deletions, activeLegalHolds: holds, openBreaches: breaches, dpiasRequiringReview: dpias, retentionRuns, processors: PROCESSOR_REGISTER, transfers: INTERNATIONAL_TRANSFER_REGISTER, requestId: id });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return Response.json(safe.body, { status: safe.status });
  }
}
