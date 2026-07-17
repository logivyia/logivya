import { z } from "zod";
import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";
import { prisma } from "@/server/db";

const schema = z.object({ release: z.literal(true), reason: z.string().trim().min(5).max(500) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = requestId(request);
  try {
    const body = schema.parse(await request.json());
    const admin = await requireCriticalAdminAction(request, "admin.privacy.update", body.reason);
    const params = await context.params;
    const existing = await prisma.privacyLegalHold.findUnique({ where: { publicId: params.id } });
    if (!existing) return Response.json({ error: "PRIVACY_LEGAL_HOLD_NOT_FOUND", requestId: id }, { status: 404 });
    const hold = await prisma.$transaction(async (tx) => {
      const updated = await tx.privacyLegalHold.update({ where: { id: existing.id }, data: { status: "RELEASED", releasedAt: new Date() } });
      if (existing.requestId) {
        const active = await tx.privacyLegalHold.count({ where: { requestId: existing.requestId, status: "ACTIVE", id: { not: existing.id } } });
        if (active === 0) await tx.dataSubjectRequest.update({ where: { id: existing.requestId }, data: { legalHold: false } });
      }
      return updated;
    });
    await writeAuditLog(request, { companyId: hold.companyId || admin.company.id, userId: admin.user.id, actorEmail: admin.user.email, actorType: "PLATFORM_ADMIN", action: "admin.privacy.legal_hold.released", reason: body.reason, entityType: "PrivacyLegalHold", entityId: hold.id, before: { status: existing.status }, after: { status: hold.status } });
    return Response.json({ hold, requestId: id });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return Response.json(safe.body, { status: error instanceof z.ZodError ? 400 : safe.status });
  }
}
