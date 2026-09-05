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

export async function closeSharedMembership(input: {
  companyId: string;
  userId: string;
  reason?: string;
}) {
  const now = new Date();
  const request = await createPrivacyRequest({
    companyId: input.companyId,
    userId: input.userId,
    type: "DELETION",
    reason: input.reason,
    metadata: {
      scope: "MEMBERSHIP",
      sharedTenantDataPreserved: true,
      destructiveExecutionEnabled: false,
    },
  });
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "CompanyUser"
      WHERE "companyId" = ${input.companyId}
        AND "userId" = ${input.userId}
      FOR UPDATE
    `;
    if (!locked.length) throw new PrivacyError("MEMBER_NOT_FOUND", 404);
    const membership = await tx.companyUser.findUnique({
      where: {
        companyId_userId: {
          companyId: input.companyId,
          userId: input.userId,
        },
      },
    });
    if (!membership || membership.status === "REMOVED") {
      throw new PrivacyError("MEMBER_NOT_FOUND", 404);
    }
    if (membership.role === "OWNER") {
      throw new PrivacyError("TENANT_DELETE_FORBIDDEN", 403);
    }

    await tx.companyUser.update({
      where: { id: membership.id },
      data: {
        status: "REMOVED",
        lifecycleState: "DETACHED",
        removedAt: now,
        detachedAt: now,
        suspendedAt: null,
      },
    });
    await Promise.all([
      tx.userSession.updateMany({
        where: { userId: input.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      tx.mobileDeviceSession.updateMany({
        where: { userId: input.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      tx.trustedDevice.updateMany({
        where: { userId: input.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      tx.forcedPasswordChangeChallenge.updateMany({
        where: { userId: input.userId, usedAt: null },
        data: { usedAt: now },
      }),
    ]);
    const [otherMemberships, ownedCompanies] = await Promise.all([
      tx.companyUser.count({
        where: {
          userId: input.userId,
          status: "ACTIVE",
          id: { not: membership.id },
        },
      }),
      tx.company.count({ where: { ownerId: input.userId } }),
    ]);
    if (otherMemberships === 0 && ownedCompanies === 0) {
      await tx.user.update({
        where: { id: input.userId },
        data: { status: "SUSPENDED" },
      });
    }
    const job = await tx.privacyDeletionJob.create({
      data: {
        publicId: privacyPublicId("DEL"),
        companyId: input.companyId,
        userId: input.userId,
        requestId: request.id,
        scope: "MEMBERSHIP",
        status: "COMPLETED",
        cancelUntil: now,
        scheduledFor: now,
        completedAt: now,
        checkpoint: {
          phase: "SHARED_MEMBERSHIP_CLOSED",
          membershipId: membership.id,
          sharedTenantDataPreserved: true,
          sessionsRevoked: true,
        },
      },
    });
    await tx.dataSubjectRequest.update({
      where: { id: request.id },
      data: { status: "COMPLETED", closedAt: now },
    });
    await tx.privacyRequestEvent.create({
      data: {
        requestId: request.id,
        actorUserId: input.userId,
        action: "SHARED_MEMBERSHIP_CLOSED",
        fromStatus: "RECEIVED",
        toStatus: "COMPLETED",
        metadata: {
          membershipId: membership.id,
          tenantPreserved: true,
        },
      },
    });
    await tx.auditLog.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        action: "MEMBER_DELETED_OWN_MEMBERSHIP",
        entityType: "CompanyUser",
        entityId: membership.id,
        beforeState: {
          status: membership.status,
          lifecycleState: membership.lifecycleState,
        },
        afterState: {
          status: "REMOVED",
          lifecycleState: "DETACHED",
          sharedTenantDataPreserved: true,
        },
      },
    });
    return job;
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
