import { randomInt, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { sendTemplateEmailSafely } from "@/server/email/service";
import { hashOpaqueToken } from "@/server/security/authentication";
import { hashPassword } from "@/server/security/passwords";
import { logger } from "@/server/observability/logger";

const TOKEN_TTL_MS = 10 * 60_000;
const REQUEST_WINDOW_MS = 60 * 60_000;
const MAX_ACCOUNT_REQUESTS = 3;
const MAX_IP_REQUESTS = 10;
const MAX_ATTEMPTS = 5;
export const RESET_REQUEST_MESSAGE = "Eğer bilgiler sistemde kayıtlıysa doğrulama kodu gönderilmiştir.";

type ResetUser = {
  id: string;
  email: string;
  memberships: Array<{ companyId: string }>;
  ownedCompanies: Array<{ id: string }>;
};

function requestMetadata(request: Request) {
  return {
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
    userAgent: request.headers.get("user-agent"),
  };
}

function normalizeIdentifier(value: string) {
  const identifier = value.trim().toLowerCase();
  if (identifier.includes("@")) return { email: identifier, phone: "" };
  return { email: "", phone: identifier.replace(/\D/g, "") };
}

async function findUser(identifier: string): Promise<ResetUser | null> {
  const normalized = normalizeIdentifier(identifier);
  if (!normalized.email && normalized.phone.length < 7) return null;
  return prisma.user.findFirst({
    where: normalized.email ? { email: normalized.email } : { phone: normalized.phone },
    select: {
      id: true,
      email: true,
      memberships: { where: { status: "ACTIVE" }, select: { companyId: true }, take: 1 },
      ownedCompanies: { select: { id: true }, take: 1 },
    },
  });
}

function companyIdFor(user: ResetUser) {
  return user.memberships[0]?.companyId || user.ownedCompanies[0]?.id;
}

function codeHash(userId: string, code: string) {
  return hashOpaqueToken(`${userId}:${code}:${process.env.PASSWORD_PEPPER ?? ""}`);
}

function codeMatches(userId: string, code: string, expectedHash: string) {
  const actual = Buffer.from(codeHash(userId, code));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function audit(request: Request, user: ResetUser, action: string, tokenId?: string, metadata: Record<string, unknown> = {}) {
  const companyId = companyIdFor(user);
  if (!companyId) return;
  const requestInfo = requestMetadata(request);
  await prisma.auditLog.create({
    data: {
      companyId,
      userId: user.id,
      action,
      entityType: "PasswordResetToken",
      entityId: tokenId,
      metadata: JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue,
      ...requestInfo,
    },
  });
}

async function recordIpRequest(request: Request, identifier: string) {
  const { ipAddress, userAgent } = requestMetadata(request);
  await prisma.loginAttempt.create({
    data: {
      email: `password-reset:${hashOpaqueToken(identifier.trim().toLowerCase())}`,
      ipAddress,
      userAgent,
      success: false,
      failureReason: "PASSWORD_RESET_REQUEST",
    },
  });
}

export async function requestPasswordReset(request: Request, identifier: string) {
  const { ipAddress } = requestMetadata(request);
  const since = new Date(Date.now() - REQUEST_WINDOW_MS);
  const ipRequests = await prisma.loginAttempt.count({
    where: { ipAddress, failureReason: "PASSWORD_RESET_REQUEST", createdAt: { gte: since } },
  });
  await recordIpRequest(request, identifier);
  if (ipRequests >= MAX_IP_REQUESTS) return;

  const user = await findUser(identifier);
  if (!user) return;
  await audit(request, user, "auth.password_reset_requested");

  const accountRequests = await prisma.passwordResetToken.count({
    where: { userId: user.id, createdAt: { gte: since } },
  });
  if (accountRequests >= MAX_ACCOUNT_REQUESTS) return;

  const code = randomInt(100_000, 1_000_000).toString();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const token = await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return tx.passwordResetToken.create({
      data: { userId: user.id, email: user.email, tokenHash: codeHash(user.id, code), expiresAt },
    });
  });

  const delivery = await sendTemplateEmailSafely({
    to: user.email,
    template: "password_reset",
    variables: { code },
    companyId: companyIdFor(user),
    userId: user.id,
  });
  if (delivery.sent) await audit(request, user, "auth.password_reset_code_sent", token.id);
  else logger.warn("Password reset email delivery failed", { userId: user.id, tokenId: token.id });
}

async function activeToken(identifier: string) {
  const user = await findUser(identifier);
  if (!user) return { user: null, token: null };
  const token = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return { user, token };
}

export async function verifyPasswordResetCode(request: Request, identifier: string, code: string) {
  const { user, token } = await activeToken(identifier);
  if (!user || !token) return false;
  if (token.expiresAt <= new Date() || token.attempts >= MAX_ATTEMPTS) {
    await audit(request, user, "auth.password_reset_failed", token.id, { reason: token.attempts >= MAX_ATTEMPTS ? "ATTEMPTS_EXHAUSTED" : "EXPIRED" });
    return false;
  }
  if (!codeMatches(user.id, code, token.tokenHash)) {
    await prisma.passwordResetToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
    await audit(request, user, "auth.password_reset_failed", token.id, { reason: "INVALID_CODE" });
    return false;
  }
  await audit(request, user, "auth.password_reset_verified", token.id);
  return true;
}

export async function completePasswordReset(request: Request, identifier: string, code: string, password: string) {
  const { user, token } = await activeToken(identifier);
  if (!user || !token || token.expiresAt <= new Date() || token.attempts >= MAX_ATTEMPTS || !codeMatches(user.id, code, token.tokenHash)) {
    if (user && token && token.attempts < MAX_ATTEMPTS) {
      await prisma.passwordResetToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
      await audit(request, user, "auth.password_reset_failed", token.id, { reason: "RESET_REJECTED" });
    }
    return false;
  }
  const passwordHash = await hashPassword(password, process.env.PASSWORD_PEPPER ?? "");
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
    prisma.userSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit(request, user, "auth.password_reset_completed", token.id);
  return true;
}
