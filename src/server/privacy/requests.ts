import "server-only";
import type { DataRequestType, PrivacyDeletionScope, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { privacyPublicId } from "@/server/privacy/ids";
import { PrivacyError } from "@/server/privacy/errors";

function operationalResponseDays() {
  const value = Number(process.env.PRIVACY_OPERATIONAL_RESPONSE_DAYS || "30");
  return Number.isInteger(value) && value >= 1 && value <= 365 ? value : 30;
}

function deletionDelayDays() {
  const value = Number(process.env.PRIVACY_DELETION_DELAY_DAYS || "7");
  return Number.isInteger(value) && value >= 1 && value <= 30 ? value : 7;
}

export async function createPrivacyRequest(input: {
  companyId: string;
  userId: string;
  type: DataRequestType;
  reason?: string;
  description?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  const now = new Date();
  const deadlineAt = new Date(now.getTime() + operationalResponseDays() * 86_400_000);
  return prisma.dataSubjectRequest.create({
    data: {
      publicId: privacyPublicId("DSR"),
      companyId: input.companyId,
      userId: input.userId,
      type: input.type,
      status: "RECEIVED",
      identityVerificationStatus: "VERIFIED",
      verificationMethod: "AUTHENTICATED_SESSION_AND_PASSWORD",
      reason: input.reason?.trim().slice(0, 500),
      description: input.description?.trim().slice(0, 4_000),
      metadata: input.metadata,
      deadlineAt,
      events: {
        create: {
          actorUserId: input.userId,
          action: "PRIVACY_REQUEST_RECEIVED",
          toStatus: "RECEIVED",
        },
      },
    },
    include: { events: true },
  });
}

export async function queueDeletionRequest(input: {
  companyId: string;
  userId: string;
  scope: PrivacyDeletionScope;
  owner: boolean;
  reason?: string;
}) {
  if (input.scope === "COMPANY" && !input.owner) throw new PrivacyError("COMPANY_OWNER_REQUIRED", 403);
  const existing = await prisma.privacyDeletionJob.findFirst({
    where: { companyId: input.companyId, userId: input.userId, status: { in: ["QUEUED", "PROCESSING", "BLOCKED"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const request = await createPrivacyRequest({
    companyId: input.companyId,
    userId: input.userId,
    type: "DELETION",
    reason: input.reason,
    metadata: { scope: input.scope, destructiveExecutionEnabled: false },
  });
  const now = new Date();
  const cancelUntil = new Date(now.getTime() + deletionDelayDays() * 86_400_000);
  return prisma.privacyDeletionJob.create({
    data: {
      publicId: privacyPublicId("DEL"),
      companyId: input.companyId,
      userId: input.userId,
      requestId: request.id,
      scope: input.scope,
      status: "QUEUED",
      cancelUntil,
      scheduledFor: cancelUntil,
      checkpoint: {
        phase: "WAITING_FOR_CANCELLATION_WINDOW",
        legalReviewRequired: true,
        destructiveExecutionEnabled: false,
      },
    },
  });
}

export async function cancelDeletionRequest(input: { companyId: string; userId: string; publicId: string }) {
  const job = await prisma.privacyDeletionJob.findFirst({
    where: { publicId: input.publicId, companyId: input.companyId, userId: input.userId },
  });
  if (!job) throw new PrivacyError("DELETION_REQUEST_NOT_FOUND", 404);
  if (job.status !== "QUEUED" || job.cancelUntil <= new Date()) throw new PrivacyError("DELETION_REQUEST_NOT_CANCELABLE", 409);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.privacyDeletionJob.update({ where: { id: job.id }, data: { status: "CANCELED" } });
    if (job.requestId) {
      await tx.dataSubjectRequest.update({ where: { id: job.requestId }, data: { status: "CANCELED", closedAt: new Date() } });
      await tx.privacyRequestEvent.create({
        data: { requestId: job.requestId, actorUserId: input.userId, action: "DELETION_REQUEST_CANCELED", fromStatus: "RECEIVED", toStatus: "CANCELED" },
      });
    }
    return updated;
  });
}
