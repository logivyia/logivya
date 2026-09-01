import { prisma } from "@/server/db";
import {
  consumeMfaChallenge,
  issueMfaChallenge,
  readMfaChallenge,
  registerMfaChallengeFailure,
  sendEmailOtpForChallenge,
  verifyEmailOtpForChallenge,
  type MfaChallengeChannel,
} from "@/server/auth/mfa-challenge";
import { hashOpaqueToken } from "@/server/security/authentication";
import { synchronizeMfaPreference } from "@/server/security/mfa-policy";

async function createPendingEmailMethod(userId: string, setupToken: string, expiresAt: Date) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.mfaCredential.updateMany({
      where: { userId, type: "EMAIL_OTP", status: "PENDING", revokedAt: null },
      data: { status: "DISABLED", revokedAt: now, disabledAt: now, setupTokenHash: null, setupKey: null },
    });
    await tx.mfaCredential.create({
      data: {
        userId,
        type: "EMAIL_OTP",
        status: "PENDING",
        secretEncrypted: null,
        recoveryCodesHashed: [],
        setupTokenHash: hashOpaqueToken(setupToken),
        setupExpiresAt: expiresAt,
      },
    });
  });
}

export async function startEmailMfaEnrollment(input: {
  userId: string;
  companyId: string;
  channel: MfaChallengeChannel;
  request: Request;
  deviceId?: string | null;
  platform?: string | null;
  appVersion?: string | null;
}) {
  const challenge = await issueMfaChallenge({ ...input, purpose: "SETUP", selectedMethod: "EMAIL_OTP" });
  await createPendingEmailMethod(input.userId, challenge.token, challenge.expiresAt);
  try {
    const email = await sendEmailOtpForChallenge({ token: challenge.token, channel: input.channel, force: true });
    return { setupToken: challenge.token, expiresAt: email.expiresAt.toISOString(), emailMasked: email.emailMasked };
  } catch (error) {
    await prisma.$transaction([
      prisma.mfaCredential.updateMany({
        where: { userId: input.userId, type: "EMAIL_OTP", setupTokenHash: hashOpaqueToken(challenge.token), revokedAt: null },
        data: { status: "DISABLED", revokedAt: new Date(), disabledAt: new Date(), setupTokenHash: null },
      }),
      prisma.mfaLoginChallenge.updateMany({ where: { tokenHash: hashOpaqueToken(challenge.token), consumedAt: null }, data: { consumedAt: new Date() } }),
    ]);
    throw error;
  }
}

export async function prepareEmailMfaEnrollmentForChallenge(input: { token: string; channel: MfaChallengeChannel }) {
  const challenge = await readMfaChallenge(input.token, input.channel);
  if (challenge.purpose !== "SETUP") throw new Error("MFA_CHALLENGE_INVALID");
  await prisma.mfaLoginChallenge.update({
    where: { id: challenge.id },
    data: { selectedMethod: "EMAIL_OTP", otpCodeHash: null, otpSentAt: null, otpExpiresAt: null, attempts: 0 },
  });
  await createPendingEmailMethod(challenge.userId, input.token, challenge.expiresAt);
  const email = await sendEmailOtpForChallenge({ token: input.token, channel: input.channel, force: true });
  return { setupToken: input.token, expiresAt: email.expiresAt.toISOString(), emailMasked: email.emailMasked };
}

export async function confirmEmailMfaEnrollment(input: { userId: string; setupToken: string; code: string; channel: MfaChallengeChannel; registerFailure?: boolean }) {
  const challenge = await readMfaChallenge(input.setupToken, input.channel);
  if (challenge.userId !== input.userId || challenge.purpose !== "SETUP" || challenge.selectedMethod !== "EMAIL_OTP") {
    throw new Error("MFA_CHALLENGE_INVALID");
  }
  const verification = await verifyEmailOtpForChallenge(challenge.id, input.code);
  if (!verification.ok) {
    if (input.registerFailure === false) return verification;
    const failure = await registerMfaChallengeFailure(challenge.id);
    return { ...verification, locked: failure.locked, attemptsRemaining: Math.max(0, 5 - failure.attempts) };
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const pending = await tx.mfaCredential.findUnique({ where: { setupTokenHash: hashOpaqueToken(input.setupToken) } });
    if (!pending || pending.userId !== input.userId || pending.type !== "EMAIL_OTP" || pending.status !== "PENDING") {
      throw new Error("MFA_ENROLLMENT_NOT_FOUND");
    }
    await tx.mfaCredential.updateMany({
      where: { userId: input.userId, type: "EMAIL_OTP", status: "ENABLED", revokedAt: null },
      data: { status: "DISABLED", disabledAt: now, revokedAt: now, isPreferred: false },
    });
    await tx.mfaCredential.update({
      where: { id: pending.id },
      data: {
        status: "ENABLED",
        verifiedAt: now,
        enabledAt: now,
        lastUsedAt: now,
        setupTokenHash: null,
        setupExpiresAt: null,
        setupAttempts: 0,
      },
    });
    await synchronizeMfaPreference(tx, input.userId);
  });
  await consumeMfaChallenge(challenge.id);
  return { ok: true as const, method: "EMAIL_OTP" as const, challengeConsumed: true as const };
}

export async function cancelEmailMfaEnrollment(userId: string, setupToken?: string) {
  const now = new Date();
  const canceled = await prisma.mfaCredential.updateMany({
    where: {
      userId,
      type: "EMAIL_OTP",
      status: "PENDING",
      revokedAt: null,
      ...(setupToken ? { setupTokenHash: hashOpaqueToken(setupToken) } : {}),
    },
    data: { status: "DISABLED", revokedAt: now, disabledAt: now, setupTokenHash: null, setupExpiresAt: null },
  });
  if (setupToken) {
    await prisma.mfaLoginChallenge.updateMany({ where: { tokenHash: hashOpaqueToken(setupToken), consumedAt: null }, data: { consumedAt: now } });
  }
  return canceled.count > 0;
}
