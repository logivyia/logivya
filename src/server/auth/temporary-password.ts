import { randomBytes } from "node:crypto";
import { z } from "zod";

import { resolveCompanyEntitlements } from "@/server/billing/company-entitlements";
import { prisma } from "@/server/db";
import { hashOpaqueToken } from "@/server/security/authentication";
import { writeAuditLog } from "@/server/security/audit";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { hashPassword, PasswordPolicyValidationError, verifyPassword } from "@/server/security/passwords";

const CHALLENGE_TTL_MS = 15 * 60_000;
const MAX_CHALLENGE_ATTEMPTS = 8;

export const completeTemporaryPasswordChangeSchema = z.object({
  challengeToken: z.string().min(32).max(256),
  temporaryPassword: z.string().min(1).max(512),
  newPassword: z.string().min(1).max(512),
  newPasswordConfirmation: z.string().min(1).max(512),
}).strict();

export type CompleteTemporaryPasswordChangeInput = z.infer<typeof completeTemporaryPasswordChangeSchema>;

export async function issueTemporaryPasswordChangeChallenge(input: {
  userId: string;
  companyId: string;
  channel: "WEB" | "MOBILE";
  deviceId?: string | null;
  platform?: string | null;
  appVersion?: string | null;
}) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
  await prisma.$transaction(async (tx) => {
    await tx.forcedPasswordChangeChallenge.updateMany({
      where: { userId: input.userId, usedAt: null },
      data: { usedAt: now },
    });
    await tx.forcedPasswordChangeChallenge.create({
      data: {
        userId: input.userId,
        companyId: input.companyId,
        tokenHash: hashOpaqueToken(token),
        channel: input.channel,
        deviceId: input.deviceId?.slice(0, 160) || null,
        platform: input.platform?.slice(0, 40) || null,
        appVersion: input.appVersion?.slice(0, 40) || null,
        expiresAt,
      },
    });
  });
  return { token, expiresAt };
}

export async function assertTemporaryPasswordTenantAccess(userId: string, companyId: string) {
  const membership = await prisma.companyUser.findUnique({
    where: { companyId_userId: { companyId, userId } },
  });
  if (
    !membership
    || membership.status !== "ACTIVE"
    || membership.lifecycleState !== "PENDING_ACTIVATION"
  ) throw new Error("FORBIDDEN");
  const entitlements = await resolveCompanyEntitlements(companyId);
  if (!entitlements?.valid) throw new Error("subscription.inactive");
}

export function temporaryPasswordPublicErrorCode(error: unknown) {
  if (error instanceof PasswordPolicyValidationError) return error.code;
  const message = error instanceof Error ? error.message : "";
  if ([
    "PASSWORD_CHANGE_CHALLENGE_INVALID",
    "PASSWORD_CHANGE_CHALLENGE_EXPIRED",
    "INVALID_TEMPORARY_PASSWORD",
    "PASSWORD_CONFIRMATION_MISMATCH",
    "PASSWORD_REUSE_NOT_ALLOWED",
    "PASSWORD_REQUIRED",
    "PASSWORD_TOO_SHORT",
    "PASSWORD_INVALID_TYPE",
    "RATE_LIMITED",
    "FORBIDDEN",
    "subscription.inactive",
    "MEMBER_ALREADY_ACTIVATED",
  ].includes(message)) return message;
  return "PASSWORD_CHANGE_FAILED";
}

export function temporaryPasswordErrorStatus(code: string) {
  if (["FORBIDDEN", "subscription.inactive"].includes(code)) return 403;
  if (code === "PASSWORD_CHANGE_CHALLENGE_EXPIRED") return 410;
  if (code === "RATE_LIMITED") return 429;
  if (code === "PASSWORD_CHANGE_FAILED") return 500;
  return 400;
}

export async function completeTemporaryPasswordChange(
  request: Request,
  input: CompleteTemporaryPasswordChangeInput,
) {
  const tokenHash = hashOpaqueToken(input.challengeToken);
  await enforceOperationRateLimit({
    scope: "temporary-password-change",
    subject: tokenHash,
    maxAttempts: MAX_CHALLENGE_ATTEMPTS,
    windowMs: CHALLENGE_TTL_MS,
    request,
  });
  if (input.newPassword !== input.newPasswordConfirmation) throw new Error("PASSWORD_CONFIRMATION_MISMATCH");

  const challenge = await prisma.forcedPasswordChangeChallenge.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  const now = new Date();
  if (!challenge || challenge.usedAt || challenge.attempts >= MAX_CHALLENGE_ATTEMPTS) {
    throw new Error("PASSWORD_CHANGE_CHALLENGE_INVALID");
  }
  if (challenge.expiresAt <= now) throw new Error("PASSWORD_CHANGE_CHALLENGE_EXPIRED");
  await assertTemporaryPasswordTenantAccess(challenge.userId, challenge.companyId);

  const temporaryPasswordValid = await verifyPassword(
    challenge.user.passwordHash,
    input.temporaryPassword,
    process.env.PASSWORD_PEPPER ?? "",
  );
  if (!temporaryPasswordValid) {
    await prisma.forcedPasswordChangeChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    throw new Error("INVALID_TEMPORARY_PASSWORD");
  }
  if (await verifyPassword(challenge.user.passwordHash, input.newPassword, process.env.PASSWORD_PEPPER ?? "")) {
    throw new Error("PASSWORD_REUSE_NOT_ALLOWED");
  }
  const passwordHash = await hashPassword(input.newPassword, process.env.PASSWORD_PEPPER ?? "");

  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "ForcedPasswordChangeChallenge"
      WHERE "id" = ${challenge.id} FOR UPDATE
    `;
    if (!rows.length) throw new Error("PASSWORD_CHANGE_CHALLENGE_INVALID");
    const current = await tx.forcedPasswordChangeChallenge.findUnique({ where: { id: challenge.id } });
    if (!current || current.usedAt || current.expiresAt <= new Date()) {
      throw new Error(current?.expiresAt && current.expiresAt <= new Date()
        ? "PASSWORD_CHANGE_CHALLENGE_EXPIRED"
        : "PASSWORD_CHANGE_CHALLENGE_INVALID");
    }
    const lockedMembership = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "CompanyUser"
      WHERE "companyId" = ${challenge.companyId}
        AND "userId" = ${challenge.userId}
      FOR UPDATE
    `;
    if (!lockedMembership.length) throw new Error("FORBIDDEN");
    const membership = await tx.companyUser.findUnique({
      where: {
        companyId_userId: {
          companyId: challenge.companyId,
          userId: challenge.userId,
        },
      },
    });
    if (
      !membership
      || membership.status !== "ACTIVE"
      || membership.lifecycleState !== "PENDING_ACTIVATION"
      || membership.activationCompletedAt
    ) {
      throw new Error("MEMBER_ALREADY_ACTIVATED");
    }

    await tx.user.update({
      where: { id: challenge.userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        temporaryPasswordSetAt: null,
      },
    });
    await tx.companyUser.update({
      where: { id: membership.id },
      data: {
        lifecycleState: "ACTIVE_SHARED_MEMBER",
        activationCompletedAt: now,
        sharedAccessExpiredAt: null,
      },
    });
    await Promise.all([
      tx.userSession.updateMany({ where: { userId: challenge.userId, revokedAt: null }, data: { revokedAt: now } }),
      tx.mobileDeviceSession.updateMany({ where: { userId: challenge.userId, revokedAt: null }, data: { revokedAt: now } }),
      tx.trustedDevice.updateMany({ where: { userId: challenge.userId, revokedAt: null }, data: { revokedAt: now } }),
      tx.forcedPasswordChangeChallenge.updateMany({ where: { userId: challenge.userId, usedAt: null }, data: { usedAt: now } }),
    ]);
  });

  const auditDetails = {
    mustChangePassword: false,
    sessionsRevoked: true,
    channel: challenge.channel,
    lifecycleState: "ACTIVE_SHARED_MEMBER",
    temporaryPasswordInvalidated: true,
  };
  await Promise.all([
    writeAuditLog(request, {
      companyId: challenge.companyId,
      userId: challenge.userId,
      action: "USER_PASSWORD_CHANGED_FIRST_LOGIN",
      result: "SUCCESS",
      entityType: "User",
      entityId: challenge.userId,
      after: auditDetails,
    }),
    writeAuditLog(request, {
      companyId: challenge.companyId,
      userId: challenge.userId,
      action: "SHARED_MEMBER_ACTIVATED",
      result: "SUCCESS",
      entityType: "User",
      entityId: challenge.userId,
      after: auditDetails,
    }),
  ]);
}
