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
import { verifyAndConsumeMfaCode } from "@/server/security/mfa";
import { verifyPassword } from "@/server/security/passwords";

export async function verifySettingsPassword(userId: string, passwordHash: string, password: string) {
  const valid = await verifyPassword(passwordHash, password, process.env.PASSWORD_PEPPER ?? "");
  if (!valid) throw new Error("PASSWORD_CONFIRMATION_REQUIRED");
  return userId;
}

export async function verifyTotpSettingsFactor(userId: string, code: string | undefined, allowIfMissing = false) {
  const totp = await prisma.mfaCredential.findFirst({
    where: { userId, type: "TOTP", status: "ENABLED", verifiedAt: { not: null }, revokedAt: null },
    select: { id: true },
  });
  if (!totp && allowIfMissing) return null;
  if (!code) throw new Error("RECENT_AUTHENTICATION_REQUIRED");
  const verified = await verifyAndConsumeMfaCode({ userId, code, method: "TOTP", allowRecoveryCode: true });
  if (!verified.ok) throw new Error(verified.reason);
  return verified;
}

export async function startEmailStepUp(input: {
  userId: string;
  companyId: string;
  channel: MfaChallengeChannel;
  request: Request;
  deviceId?: string | null;
}) {
  const enabled = await prisma.mfaCredential.findFirst({
    where: { userId: input.userId, type: "EMAIL_OTP", status: "ENABLED", verifiedAt: { not: null }, revokedAt: null },
    select: { id: true },
  });
  if (!enabled) throw new Error("MFA_METHOD_NOT_ENABLED");
  const challenge = await issueMfaChallenge({ ...input, purpose: "STEP_UP", selectedMethod: "EMAIL_OTP" });
  const email = await sendEmailOtpForChallenge({ token: challenge.token, channel: input.channel, force: true });
  return { challengeToken: challenge.token, emailMasked: email.emailMasked, expiresAt: email.expiresAt.toISOString() };
}

export async function verifyEmailStepUp(input: { userId: string; token: string; code: string; channel: MfaChallengeChannel; deviceId?: string | null }) {
  const challenge = await readMfaChallenge(input.token, input.channel);
  if (challenge.userId !== input.userId || challenge.purpose !== "STEP_UP" || challenge.selectedMethod !== "EMAIL_OTP") {
    throw new Error("MFA_CHALLENGE_INVALID");
  }
  if (input.channel === "MOBILE" && challenge.deviceId && challenge.deviceId !== input.deviceId) throw new Error("MFA_DEVICE_MISMATCH");
  const verified = await verifyEmailOtpForChallenge(challenge.id, input.code);
  if (!verified.ok) {
    await registerMfaChallengeFailure(challenge.id);
    throw new Error(verified.reason);
  }
  await consumeMfaChallenge(challenge.id);
  return verified;
}
