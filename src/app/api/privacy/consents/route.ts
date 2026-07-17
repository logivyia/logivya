import { requirePrivacyAuth } from "@/server/privacy/auth";
import { privacyErrorResponse } from "@/server/privacy/errors";
import { prisma } from "@/server/db";
import { PRIVACY_PURPOSES } from "@/server/privacy/catalog";

export async function GET(request: Request) {
  try {
    const context = await requirePrivacyAuth(request);
    const records = await prisma.consentRecord.findMany({
      where: { userId: context.user.id, OR: [{ companyId: context.company.id }, { companyId: null }] },
      select: { id: true, type: true, purposeCode: true, status: true, version: true, legalTextVersion: true, noticeVersion: true, granted: true, collectionMethod: true, platform: true, appVersion: true, locale: true, collectedAt: true, withdrawnAt: true },
      orderBy: { collectedAt: "desc" },
    });
    return Response.json({ purposes: PRIVACY_PURPOSES, records });
  } catch (error) {
    return privacyErrorResponse(error);
  }
}
