import { prisma } from "@/server/db";
import { readMfaChallenge, selectMfaChallengeMethod, type MfaChallengeChannel } from "@/server/auth/mfa-challenge";
import { cancelPendingMfaEnrollment, createAndStoreMfaEnrollment } from "@/server/security/mfa";
import { cancelEmailMfaEnrollment, prepareEmailMfaEnrollmentForChallenge } from "@/server/security/mfa-email";
import { resolveMfaLoginDecision, type MfaMethodType } from "@/server/security/mfa-policy";

export async function chooseMfaChallengeMethod(input: {
  token: string;
  channel: MfaChallengeChannel;
  method: MfaMethodType;
  deviceId?: string | null;
}) {
  const challenge = await readMfaChallenge(input.token, input.channel);
  if (input.channel === "MOBILE" && challenge.deviceId && challenge.deviceId !== input.deviceId) {
    throw new Error("MFA_DEVICE_MISMATCH");
  }
  const membership = await prisma.companyUser.findUnique({
    where: { companyId_userId: { companyId: challenge.companyId, userId: challenge.userId } },
    include: { company: true },
  });
  if (!membership || membership.status !== "ACTIVE" || challenge.user.status !== "ACTIVE") {
    throw new Error("MFA_CHALLENGE_INVALID");
  }
  const decision = await resolveMfaLoginDecision({
    userId: challenge.userId,
    companyPolicy: membership.company.mfaPolicy,
    role: membership.role,
    legacyRequired: challenge.user.mfaRequired,
    preferredMethod: challenge.user.preferredMfaMethod,
  });

  if (challenge.purpose !== "SETUP") {
    if (!decision.enabledMethods.includes(input.method)) throw new Error("MFA_METHOD_NOT_ENABLED");
    return selectMfaChallengeMethod(input);
  }
  if (!decision.setupRequired || !decision.requiredEnrollmentMethods.includes(input.method)) {
    throw new Error("MFA_METHOD_NOT_ALLOWED_BY_POLICY");
  }

  if (input.method === "TOTP") {
    await cancelEmailMfaEnrollment(challenge.userId);
    await prisma.mfaLoginChallenge.update({
      where: { id: challenge.id },
      data: { selectedMethod: "TOTP", otpCodeHash: null, otpSentAt: null, otpExpiresAt: null, attempts: 0 },
    });
    const enrollment = await createAndStoreMfaEnrollment(challenge.userId, challenge.user.email, { replacePending: true });
    return { selectedMethod: "TOTP" as const, ...enrollment };
  }

  await cancelPendingMfaEnrollment(challenge.userId);
  const enrollment = await prepareEmailMfaEnrollmentForChallenge({ token: input.token, channel: input.channel });
  return { selectedMethod: "EMAIL_OTP" as const, ...enrollment };
}
