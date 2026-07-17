import { z } from "zod";
import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";
import { prisma } from "@/server/db";

const schema = z.object({ status: z.enum(["OPEN", "ASSESSING", "CONTAINED", "MONITORING", "CLOSED"]), containmentActions: z.string().trim().max(4_000).optional(), rootCause: z.string().trim().max(4_000).optional(), remediation: z.string().trim().max(4_000).optional(), controllerNotificationStatus: z.string().trim().max(100).optional(), authorityNotificationStatus: z.string().trim().max(100).optional(), subjectNotificationStatus: z.string().trim().max(100).optional(), legalReviewNotes: z.string().trim().max(4_000).optional(), reason: z.string().trim().min(5).max(500) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = requestId(request);
  try {
    const body = schema.parse(await request.json());
    const admin = await requireCriticalAdminAction(request, "admin.privacy.update", body.reason);
    const params = await context.params;
    const existing = await prisma.privacyBreach.findUnique({ where: { publicId: params.id } });
    if (!existing) return Response.json({ error: "PRIVACY_BREACH_NOT_FOUND", requestId: id }, { status: 404 });
    const breach = await prisma.privacyBreach.update({ where: { id: existing.id }, data: { status: body.status, containmentActions: body.containmentActions, rootCause: body.rootCause, remediation: body.remediation, controllerNotificationStatus: body.controllerNotificationStatus, authorityNotificationStatus: body.authorityNotificationStatus, subjectNotificationStatus: body.subjectNotificationStatus, legalReviewNotes: body.legalReviewNotes, closedAt: body.status === "CLOSED" ? new Date() : null } });
    await writeAuditLog(request, { companyId: admin.company.id, userId: admin.user.id, actorEmail: admin.user.email, actorType: "PLATFORM_ADMIN", action: "admin.privacy.breach.updated", reason: body.reason, entityType: "PrivacyBreach", entityId: breach.id, before: { status: existing.status }, after: { status: breach.status } });
    return Response.json({ breach, requestId: id });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return Response.json(safe.body, { status: error instanceof z.ZodError ? 400 : safe.status });
  }
}
