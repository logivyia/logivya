import { z } from "zod";
import { requireCriticalAdminAction, requirePlatformAdmin } from "@/server/auth/platform-admin";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";
import { prisma } from "@/server/db";

const statuses = ["RECEIVED", "VERIFYING", "IDENTITY_VERIFICATION_REQUIRED", "IN_REVIEW", "WAITING_FOR_USER", "PROCESSING", "APPROVED", "PARTIALLY_APPROVED", "COMPLETED", "REJECTED", "CANCELED", "CLOSED"] as const;
const schema = z.object({ status: z.enum(statuses), reason: z.string().trim().min(5).max(500), response: z.string().trim().max(4_000).optional(), internal: z.boolean().default(false), verificationMethod: z.string().trim().max(120).optional(), responseSummary: z.string().trim().max(2_000).optional(), extensionReason: z.string().trim().max(1_000).optional() });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = requestId(request);
  try {
    await requirePlatformAdmin("admin.privacy.read", request);
    const params = await context.params;
    const privacyRequest = await prisma.dataSubjectRequest.findUnique({
      where: { publicId: params.id },
      include: { user: { select: { id: true, name: true, email: true } }, company: { select: { id: true, name: true } }, messages: { orderBy: { createdAt: "asc" } }, events: { orderBy: { createdAt: "asc" } }, exportJobs: true, deletionJobs: true, legalHolds: true },
    });
    if (!privacyRequest) return Response.json({ error: "PRIVACY_REQUEST_NOT_FOUND", requestId: id }, { status: 404 });
    return Response.json({ request: privacyRequest, requestId: id });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return Response.json(safe.body, { status: safe.status });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = requestId(request);
  try {
    const body = schema.parse(await request.json());
    const admin = await requireCriticalAdminAction(request, "admin.privacy.update", body.reason);
    const params = await context.params;
    const existing = await prisma.dataSubjectRequest.findUnique({ where: { publicId: params.id } });
    if (!existing) return Response.json({ error: "PRIVACY_REQUEST_NOT_FOUND", requestId: id }, { status: 404 });
    if (existing.legalHold && ["COMPLETED", "CLOSED"].includes(body.status)) return Response.json({ error: "PRIVACY_REQUEST_LEGAL_HOLD_ACTIVE", requestId: id }, { status: 409 });
    if (["COMPLETED", "REJECTED", "CLOSED"].includes(body.status) && !(body.responseSummary || existing.responseSummary)) return Response.json({ error: "PRIVACY_RESPONSE_SUMMARY_REQUIRED", requestId: id }, { status: 400 });
    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.dataSubjectRequest.update({
        where: { id: existing.id },
        data: {
          status: body.status,
          assignedAdminUserId: admin.user.id,
          verificationMethod: body.verificationMethod,
          identityVerificationStatus: body.verificationMethod ? "VERIFIED" : undefined,
          responseSummary: body.responseSummary,
          extensionReason: body.extensionReason,
          completedAt: body.status === "COMPLETED" ? now : undefined,
          closedAt: body.status === "CLOSED" ? now : undefined,
        },
      });
      await tx.privacyRequestEvent.create({ data: { requestId: existing.id, actorUserId: admin.user.id, action: "ADMIN_PRIVACY_REQUEST_STATUS_CHANGED", fromStatus: existing.status, toStatus: body.status, metadata: { reason: body.reason } } });
      if (body.response) await tx.privacyRequestMessage.create({ data: { requestId: existing.id, actorUserId: admin.user.id, actorType: "ADMIN", message: body.response, isInternal: body.internal } });
      return result;
    });
    await writeAuditLog(request, { companyId: existing.companyId || admin.company.id, userId: admin.user.id, actorEmail: admin.user.email, actorType: "PLATFORM_ADMIN", action: "admin.privacy.request.updated", reason: body.reason, entityType: "DataSubjectRequest", entityId: existing.id, before: { status: existing.status }, after: { status: updated.status } });
    return Response.json({ request: updated, requestId: id });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return Response.json(safe.body, { status: error instanceof z.ZodError ? 400 : safe.status });
  }
}
