import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireCriticalAdminAction, requirePlatformAdmin } from "@/server/auth/platform-admin";
import { privacyPublicId } from "@/server/privacy/ids";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";
import { prisma } from "@/server/db";

const schema = z.object({ projectName: z.string().trim().min(3).max(200), purpose: z.string().trim().min(10).max(2_000), processingDescription: z.string().trim().min(10).max(4_000), necessityAssessment: z.string().trim().min(10).max(4_000), proportionalityAssessment: z.string().trim().min(10).max(4_000), dataFlow: z.record(z.string(), z.unknown()), risks: z.array(z.unknown()).max(100), safeguards: z.array(z.unknown()).max(100), residualRisk: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]), reviewAt: z.coerce.date().optional(), reason: z.string().trim().min(5).max(500) });

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await requirePlatformAdmin("admin.privacy.read", request);
    const dpias = await prisma.privacyDpia.findMany({ orderBy: { updatedAt: "desc" }, take: 200 });
    return Response.json({ legalReviewStatus: "LEGAL_REVIEW_REQUIRED", dpias, requestId: id });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return Response.json(safe.body, { status: safe.status });
  }
}

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const body = schema.parse(await request.json());
    const admin = await requireCriticalAdminAction(request, "admin.privacy.update", body.reason);
    const dpia = await prisma.privacyDpia.create({ data: { publicId: privacyPublicId("DPIA"), projectName: body.projectName, ownerUserId: admin.user.id, purpose: body.purpose, processingDescription: body.processingDescription, necessityAssessment: body.necessityAssessment, proportionalityAssessment: body.proportionalityAssessment, dataFlow: body.dataFlow as Prisma.InputJsonValue, risks: body.risks as Prisma.InputJsonValue, safeguards: body.safeguards as Prisma.InputJsonValue, residualRisk: body.residualRisk, reviewAt: body.reviewAt } });
    await writeAuditLog(request, { companyId: admin.company.id, userId: admin.user.id, actorEmail: admin.user.email, actorType: "PLATFORM_ADMIN", action: "admin.privacy.dpia.created", reason: body.reason, entityType: "PrivacyDpia", entityId: dpia.id, after: { publicId: dpia.publicId, residualRisk: dpia.residualRisk, legalReviewStatus: dpia.legalReviewStatus } });
    return Response.json({ dpia, requestId: id }, { status: 201 });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return Response.json(safe.body, { status: error instanceof z.ZodError ? 400 : safe.status });
  }
}
