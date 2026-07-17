import { z } from "zod";
import { requireCriticalAdminAction, requirePlatformAdmin } from "@/server/auth/platform-admin";
import { privacyPublicId } from "@/server/privacy/ids";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";
import { prisma } from "@/server/db";

const schema = z.object({ title: z.string().trim().min(5).max(200), discoveredAt: z.coerce.date(), occurredAt: z.coerce.date().optional(), affectedSystem: z.string().trim().min(2).max(200), dataCategories: z.array(z.string().trim().min(1).max(100)).min(1).max(30), dataSubjectCategories: z.array(z.string().trim().min(1).max(100)).min(1).max(30), estimatedAffectedCount: z.number().int().nonnegative().optional(), riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]), containmentActions: z.string().trim().max(4_000).optional(), reason: z.string().trim().min(5).max(500) });

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await requirePlatformAdmin("admin.privacy.read", request);
    const breaches = await prisma.privacyBreach.findMany({ orderBy: { discoveredAt: "desc" }, take: 200 });
    return Response.json({ legalReviewStatus: "LEGAL_REVIEW_REQUIRED", breaches, requestId: id });
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
    const breach = await prisma.privacyBreach.create({ data: { publicId: privacyPublicId("BR"), title: body.title, discoveredAt: body.discoveredAt, occurredAt: body.occurredAt, reportedByUserId: admin.user.id, affectedSystem: body.affectedSystem, dataCategories: body.dataCategories, dataSubjectCategories: body.dataSubjectCategories, estimatedAffectedCount: body.estimatedAffectedCount, riskLevel: body.riskLevel, containmentActions: body.containmentActions } });
    await writeAuditLog(request, { companyId: admin.company.id, userId: admin.user.id, actorEmail: admin.user.email, actorType: "PLATFORM_ADMIN", action: "admin.privacy.breach.created", reason: body.reason, entityType: "PrivacyBreach", entityId: breach.id, after: { publicId: breach.publicId, riskLevel: breach.riskLevel, status: breach.status } });
    return Response.json({ breach, requestId: id }, { status: 201 });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return Response.json(safe.body, { status: error instanceof z.ZodError ? 400 : safe.status });
  }
}
