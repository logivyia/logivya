import { z } from "zod";
import { requireCriticalAdminAction, requirePlatformAdmin } from "@/server/auth/platform-admin";
import { privacyPublicId } from "@/server/privacy/ids";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";
import { prisma } from "@/server/db";

const schema = z.object({ companyId: z.string().trim().min(1).optional(), userId: z.string().trim().min(1).optional(), requestPublicId: z.string().trim().min(8).max(80).optional(), scopeType: z.enum(["COMPANY", "USER", "PRIVACY_REQUEST", "DATA_CATEGORY"]), scopeId: z.string().trim().min(1).max(200), holdReason: z.string().trim().min(10).max(2_000), reviewAt: z.coerce.date(), endsAt: z.coerce.date().optional(), reason: z.string().trim().min(5).max(500) });

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await requirePlatformAdmin("admin.privacy.read", request);
    const holds = await prisma.privacyLegalHold.findMany({ include: { company: { select: { id: true, name: true } }, user: { select: { id: true, name: true, email: true } }, request: { select: { publicId: true, type: true, status: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
    return Response.json({ holds, requestId: id });
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
    const privacyRequest = body.requestPublicId ? await prisma.dataSubjectRequest.findUnique({ where: { publicId: body.requestPublicId } }) : null;
    if (body.requestPublicId && !privacyRequest) return Response.json({ error: "PRIVACY_REQUEST_NOT_FOUND", requestId: id }, { status: 404 });
    const hold = await prisma.$transaction(async (tx) => {
      const created = await tx.privacyLegalHold.create({ data: { publicId: privacyPublicId("HOLD"), companyId: body.companyId || privacyRequest?.companyId, userId: body.userId || privacyRequest?.userId, requestId: privacyRequest?.id, scopeType: body.scopeType, scopeId: body.scopeId, reason: body.holdReason, createdByUserId: admin.user.id, approvedByUserId: admin.user.id, reviewAt: body.reviewAt, endsAt: body.endsAt } });
      if (privacyRequest) await tx.dataSubjectRequest.update({ where: { id: privacyRequest.id }, data: { legalHold: true } });
      return created;
    });
    await writeAuditLog(request, { companyId: hold.companyId || admin.company.id, userId: admin.user.id, actorEmail: admin.user.email, actorType: "PLATFORM_ADMIN", action: "admin.privacy.legal_hold.created", reason: body.reason, entityType: "PrivacyLegalHold", entityId: hold.id, after: { publicId: hold.publicId, scopeType: hold.scopeType, scopeId: hold.scopeId, reviewAt: hold.reviewAt } });
    return Response.json({ hold, requestId: id }, { status: 201 });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return Response.json(safe.body, { status: error instanceof z.ZodError ? 400 : safe.status });
  }
}
