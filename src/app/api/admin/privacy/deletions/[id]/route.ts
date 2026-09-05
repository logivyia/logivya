import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { sendTemplateEmailSafely } from "@/server/email/service";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";

const confirmation = "I CONFIRM DATA DELETION IS COMPLETE";
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("START_PROCESSING"), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("BLOCK"), reason: z.string().trim().min(5).max(500) }),
  z.object({
    action: z.literal("COMPLETE"),
    reason: z.string().trim().min(5).max(500),
    evidenceReference: z.string().trim().min(8).max(500),
    confirmation: z.literal(confirmation),
  }),
  z.object({ action: z.literal("RESEND_NOTICE"), reason: z.string().trim().min(5).max(500) }),
]);

function jsonRecord(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

async function hasActiveLegalHold(job: { companyId: string; userId: string; requestId: string | null; request: { legalHold: boolean } | null }) {
  if (job.request?.legalHold) return true;
  const now = new Date();
  const scopes: Prisma.PrivacyLegalHoldWhereInput[] = [
    { companyId: job.companyId, scopeType: "COMPANY" },
    { userId: job.userId, scopeType: "USER" },
  ];
  if (job.requestId) scopes.push({ requestId: job.requestId });
  return (await prisma.privacyLegalHold.count({
    where: {
      status: "ACTIVE",
      startsAt: { lte: now },
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, { OR: scopes }],
    },
  })) > 0;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = requestId(request);
  try {
    const body = actionSchema.parse(await request.json());
    const admin = await requireCriticalAdminAction(request, "admin.privacy.update", body.reason);
    const params = await context.params;
    const existing = await prisma.privacyDeletionJob.findUnique({
      where: { publicId: params.id },
      include: {
        user: { select: { id: true, email: true, locale: true } },
        company: { select: { id: true, name: true } },
        request: { select: { id: true, publicId: true, status: true, legalHold: true } },
      },
    });
    if (!existing) return Response.json({ error: "PRIVACY_DELETION_JOB_NOT_FOUND", requestId: id }, { status: 404 });

    const now = new Date();
    if (body.action === "START_PROCESSING") {
      if (!["QUEUED", "BLOCKED"].includes(existing.status)) return Response.json({ error: "PRIVACY_DELETION_JOB_NOT_STARTABLE", requestId: id }, { status: 409 });
      if (existing.cancelUntil > now) return Response.json({ error: "PRIVACY_DELETION_CANCELLATION_WINDOW_ACTIVE", requestId: id }, { status: 409 });
      if (await hasActiveLegalHold(existing)) return Response.json({ error: "PRIVACY_DELETION_LEGAL_HOLD_ACTIVE", requestId: id }, { status: 409 });
    }
    if (body.action === "BLOCK" && !["QUEUED", "PROCESSING"].includes(existing.status)) {
      return Response.json({ error: "PRIVACY_DELETION_JOB_NOT_BLOCKABLE", requestId: id }, { status: 409 });
    }
    if (body.action === "COMPLETE") {
      if (existing.status !== "PROCESSING") return Response.json({ error: "PRIVACY_DELETION_JOB_NOT_PROCESSING", requestId: id }, { status: 409 });
      if (await hasActiveLegalHold(existing)) return Response.json({ error: "PRIVACY_DELETION_LEGAL_HOLD_ACTIVE", requestId: id }, { status: 409 });
    }
    if (body.action === "RESEND_NOTICE" && existing.status !== "COMPLETED") {
      return Response.json({ error: "PRIVACY_DELETION_JOB_NOT_COMPLETED", requestId: id }, { status: 409 });
    }

    const updated = body.action === "RESEND_NOTICE" ? existing : await prisma.$transaction(async (tx) => {
      const nextStatus = body.action === "START_PROCESSING" ? "PROCESSING" : body.action === "BLOCK" ? "BLOCKED" : "COMPLETED";
      const nextRequestStatus = body.action === "START_PROCESSING" ? "PROCESSING" : body.action === "BLOCK" ? "IN_REVIEW" : "COMPLETED";
      const checkpoint = {
        ...jsonRecord(existing.checkpoint),
        phase: body.action === "START_PROCESSING" ? "MANUAL_DELETION_IN_PROGRESS" : body.action === "BLOCK" ? "MANUAL_DELETION_BLOCKED" : "MANUAL_DELETION_VERIFIED",
        destructiveExecutionEnabled: false,
        operatedAt: now.toISOString(),
        operatedByUserId: admin.user.id,
      } satisfies Prisma.InputJsonObject;
      const result = body.action === "COMPLETE" ? {
        ...jsonRecord(existing.result),
        completionMode: "MANUAL_VERIFIED",
        evidenceReference: body.evidenceReference,
        completedAt: now.toISOString(),
        completedByUserId: admin.user.id,
      } satisfies Prisma.InputJsonObject : undefined;
      const job = await tx.privacyDeletionJob.update({
        where: { id: existing.id },
        data: {
          status: nextStatus,
          checkpoint,
          result,
          lastError: body.action === "BLOCK" ? body.reason : null,
          attempts: body.action === "START_PROCESSING" ? { increment: 1 } : undefined,
          completedAt: body.action === "COMPLETE" ? now : undefined,
        },
      });
      if (existing.request) {
        await tx.dataSubjectRequest.update({
          where: { id: existing.request.id },
          data: {
            status: nextRequestStatus,
            assignedAdminUserId: admin.user.id,
            responseSummary: body.action === "COMPLETE" ? "Eligible account data was manually deleted or anonymized and the operation was verified." : undefined,
            completedAt: body.action === "COMPLETE" ? now : undefined,
          },
        });
        await tx.privacyRequestEvent.create({
          data: {
            requestId: existing.request.id,
            actorUserId: admin.user.id,
            action: `ADMIN_PRIVACY_DELETION_${body.action}`,
            fromStatus: existing.request.status,
            toStatus: nextRequestStatus,
            metadata: { reason: body.reason, jobPublicId: existing.publicId, ...(body.action === "COMPLETE" ? { evidenceReference: body.evidenceReference } : {}) },
          },
        });
        if (body.action === "COMPLETE") {
          await tx.privacyRequestMessage.create({
            data: {
              requestId: existing.request.id,
              actorUserId: admin.user.id,
              actorType: "ADMIN",
              isInternal: false,
              message: "Hesap silme talebiniz tamamlandi. Uygun veriler silindi veya anonimlestirildi; yasal saklama zorunlulugu bulunan kayitlar sinirli erisimle saklanabilir.",
              metadata: { jobPublicId: existing.publicId, completedAt: now.toISOString() },
            },
          });
        }
      }
      return job;
    });

    let notification: Awaited<ReturnType<typeof sendTemplateEmailSafely>> | null = null;
    if (body.action === "COMPLETE" || body.action === "RESEND_NOTICE") {
      const turkish = (existing.user.locale || "tr").toLowerCase().startsWith("tr");
      notification = await sendTemplateEmailSafely({
        to: existing.user.email,
        template: "notification_generic",
        companyId: existing.companyId,
        userId: existing.userId,
        variables: {
          title: turkish ? "Logivya hesap silme talebiniz tamamlandi" : "Your Logivya account deletion request is complete",
          message: turkish
            ? "Hesap silme talebiniz tamamlandi. Uygun veriler silindi veya anonimlestirildi. Yasal saklama zorunlulugu bulunan kayitlar sinirli erisimle saklanabilir."
            : "Your account deletion request is complete. Eligible data was deleted or anonymized. Records subject to a legal retention obligation may remain under restricted access.",
          locale: turkish ? "tr" : "en",
          openUrl: "https://www.logivya.com/account-deletion",
        },
      });
      await prisma.privacyDeletionJob.update({
        where: { id: existing.id },
        data: {
          result: {
            ...jsonRecord(updated.result),
            notification: {
              sent: notification.sent,
              attemptedAt: new Date().toISOString(),
              ...(notification.sent ? { providerId: notification.providerId || null } : { errorCode: notification.errorCode }),
            },
          },
        },
      });
    }

    await writeAuditLog(request, {
      companyId: existing.companyId || admin.company.id,
      userId: admin.user.id,
      actorEmail: admin.user.email,
      actorType: "PLATFORM_ADMIN",
      action: `admin.privacy.deletion.${body.action.toLowerCase()}`,
      reason: body.reason,
      entityType: "PrivacyDeletionJob",
      entityId: existing.id,
      before: { status: existing.status },
      after: { status: updated.status, notificationSent: notification?.sent },
    });
    return Response.json({ job: updated, notification, requestId: id });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return Response.json(safe.body, { status: error instanceof z.ZodError ? 400 : safe.status });
  }
}
