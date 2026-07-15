import { randomBytes } from "node:crypto";

import { getRequestLocale, translateForLocale } from "@/i18n/server";
import { safelyEvaluateTrialAfterConnection } from "@/server/billing/trial-service";
import { prisma } from "@/server/db";
import { sendTemplateEmailSafely } from "@/server/email/service";
import { hashOpaqueToken } from "@/server/security/authentication";
import { writeAuditLog } from "@/server/security/audit";

const EMAIL_VERIFICATION_LIFETIME_MS = 24 * 60 * 60_000;

function applicationBaseUrl(request: Request) {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || new URL(request.url).origin).replace(/\/$/u, "");
}

export async function issueEmailVerification(request: Request, input: { userId: string; companyId: string; email: string }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_LIFETIME_MS);
  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.deleteMany({ where: { userId: input.userId, usedAt: null } });
    await tx.emailVerificationToken.create({
      data: { userId: input.userId, tokenHash: hashOpaqueToken(token), expiresAt },
    });
  });
  const locale = await getRequestLocale(request.headers.get("x-logivya-locale"));
  const verificationUrl = `${applicationBaseUrl(request)}/api/auth/email-verification/verify?token=${encodeURIComponent(token)}`;
  const [title, message] = await Promise.all([
    translateForLocale(locale, "email.verification.subject"),
    translateForLocale(locale, "email.verification.message", { url: verificationUrl }),
  ]);
  const delivery = await sendTemplateEmailSafely({
    companyId: input.companyId,
    userId: input.userId,
    to: input.email,
    template: "email_verification",
    variables: { title, message, locale },
  });
  await writeAuditLog(request, {
    companyId: input.companyId,
    userId: input.userId,
    action: "user.email_verification_issued",
    entityType: "User",
    entityId: input.userId,
    after: { expiresAt, emailSent: delivery.sent },
  });
  return { sent: delivery.sent, expiresAt };
}

export async function verifyEmailToken(request: Request, token: string) {
  const tokenHash = hashOpaqueToken(token.trim());
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const record = await tx.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, emailVerifiedAt: true, memberships: { where: { status: "ACTIVE" }, select: { companyId: true }, take: 1 } } } },
    });
    if (!record) throw new Error("EMAIL_VERIFICATION_INVALID");
    if (record.usedAt || record.user.emailVerifiedAt) return { userId: record.userId, companyId: record.user.memberships[0]?.companyId, alreadyVerified: true };
    if (record.expiresAt <= now) throw new Error("EMAIL_VERIFICATION_EXPIRED");
    const membership = record.user.memberships[0];
    if (!membership) throw new Error("EMAIL_VERIFICATION_INVALID");
    await tx.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: now } });
    await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: now } });
    await tx.auditLog.create({
      data: {
        companyId: membership.companyId,
        userId: record.userId,
        action: "user.email_verified",
        entityType: "User",
        entityId: record.userId,
      },
    });
    return { userId: record.userId, companyId: membership.companyId, alreadyVerified: false };
  });
  const candidate = result.companyId
    ? await prisma.trialEntitlement.findUnique({ where: { companyId_userId: { companyId: result.companyId, userId: result.userId } }, select: { whatsappAccountId: true } })
    : null;
  if (candidate?.whatsappAccountId) await safelyEvaluateTrialAfterConnection(candidate.whatsappAccountId);
  return result;
}
