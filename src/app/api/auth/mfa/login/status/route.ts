import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { MFA_CHALLENGE_COOKIE, readMfaChallenge } from "@/server/auth/mfa-challenge";
import {
  authCorrelationId,
  authNoStoreHeaders,
  publicAuthErrorBody,
  publicAuthFailure,
} from "@/server/auth/public-errors";
import { prisma } from "@/server/db";
import { resolveMfaLoginDecision } from "@/server/security/mfa-policy";

export async function GET(request: Request) {
  const correlationId = authCorrelationId(request);
  const headers = authNoStoreHeaders(correlationId);
  const challengeToken = (await cookies()).get(MFA_CHALLENGE_COOKIE)?.value;
  if (!challengeToken) {
    const failure = publicAuthFailure("MFA_CHALLENGE_INVALID");
    return NextResponse.json(
      publicAuthErrorBody(failure.code, correlationId),
      { status: failure.status, headers },
    );
  }

  try {
    const challenge = await readMfaChallenge(challengeToken, "WEB");
    if (challenge.purpose !== "LOGIN") {
      const failure = publicAuthFailure("MFA_CHALLENGE_INVALID");
      return NextResponse.json(
        publicAuthErrorBody(failure.code, correlationId),
        { status: failure.status, headers },
      );
    }

    const membership = await prisma.companyUser.findUnique({
      where: { companyId_userId: { companyId: challenge.companyId, userId: challenge.userId } },
      include: { company: true },
    });
    if (!membership || membership.status !== "ACTIVE" || challenge.user.status !== "ACTIVE") {
      throw new Error("MFA_CHALLENGE_INVALID");
    }

    const mfa = await resolveMfaLoginDecision({
      userId: challenge.userId,
      companyPolicy: membership.company.mfaPolicy,
      role: membership.role,
      legacyRequired: challenge.user.mfaRequired,
      preferredMethod: challenge.user.preferredMfaMethod,
    });

    return NextResponse.json({
      mfaRequired: true,
      mfaSetupRequired: false,
      expiresAt: challenge.expiresAt.toISOString(),
      availableMethods: mfa.enabledMethods,
      selectedMethod: challenge.selectedMethod,
      preferredMethod: mfa.selectedMethod,
      recoveryAvailable: mfa.enabledMethods.includes("TOTP"),
    }, { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "AUTH_INTERNAL_ERROR";
    const failure = publicAuthFailure(code);
    return NextResponse.json(
      publicAuthErrorBody(code, correlationId),
      { status: failure.status, headers },
    );
  }
}
