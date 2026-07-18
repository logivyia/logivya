import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { MobilePlatform } from "@prisma/client";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = parts.join("=").replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.production.local"));
loadEnvFile(path.join(process.cwd(), ".env.local"));

if (process.env.ALLOW_PRODUCTION_AUTH_INTEGRATION_TEST !== "1") {
  throw new Error("Set ALLOW_PRODUCTION_AUTH_INTEGRATION_TEST=1 to run the isolated auth proof.");
}

async function main() {
  const [{ prisma }, { createMobileSession, rotateRefreshToken }] = await Promise.all([
    import("../src/server/db"),
    import("../src/server/mobile/auth"),
  ]);
  const suffix = Date.now().toString(36);
  let userId: string | null = null;
  let companyId: string | null = null;

  try {
    const user = await prisma.user.create({
      data: {
        name: "Mobile Auth Integration Test",
        username: `auth-proof-${suffix}`,
        email: `auth-proof-${suffix}@invalid.logivya`,
        passwordHash: "integration-test-disabled",
      },
    });
    userId = user.id;
    const company = await prisma.company.create({ data: { name: `Auth Proof ${suffix}`, ownerId: user.id } });
    companyId = company.id;
    await prisma.companyUser.create({ data: { companyId: company.id, userId: user.id, role: "OWNER" } });

    const initial = await createMobileSession({
      userId: user.id,
      companyId: company.id,
      role: "OWNER",
      deviceId: `proof-${suffix}`,
      platform: MobilePlatform.ANDROID,
      appVersion: "1.0.102",
    });
    const request = new Request("https://www.logivya.com/api/mobile/auth/refresh", {
      method: "POST",
      headers: { "user-agent": "logivya-release-proof/132" },
    });

    type RotatedTokens = Awaited<ReturnType<typeof rotateRefreshToken>>;
    const liveBaseUrl = process.env.MOBILE_AUTH_INTEGRATION_BASE_URL?.replace(/\/+$/, "");
    async function rotate(token: string): Promise<RotatedTokens> {
      if (!liveBaseUrl) return rotateRefreshToken(token, request);
      const response = await fetch(`${liveBaseUrl}/api/mobile/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "logivya-release-proof/132" },
        body: JSON.stringify({ refreshToken: token }),
      });
      const payload = await response.json() as {
        data?: { tokens?: RotatedTokens };
        error?: { code?: string };
      };
      if (!response.ok || !payload.data?.tokens) {
        const error = new Error(payload.error?.code || `HTTP_${response.status}`) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      return payload.data.tokens;
    }

    const rotated = await rotate(initial.refreshToken);
    const recovered = await rotate(initial.refreshToken);
    if (recovered.refreshToken !== rotated.refreshToken) {
      throw new Error("Recovered refresh token differs from the active replacement.");
    }

    const session = await prisma.mobileDeviceSession.findFirstOrThrow({ where: { userId: user.id, companyId: company.id } });
    const history = await prisma.mobileRefreshTokenHistory.findFirstOrThrow({ where: { sessionId: session.id } });
    if (session.revokedAt) throw new Error("Session was revoked during a legitimate refresh retry.");
    if (history.retryCount !== 1 || !history.retryAcceptedAt) {
      throw new Error("Legitimate refresh retry was not recorded.");
    }

    await prisma.mobileRefreshTokenHistory.update({
      where: { id: history.id },
      data: { recoveryExpiresAt: new Date(Date.now() - 1_000) },
    });
    let replayRejected = false;
    try {
      await rotate(initial.refreshToken);
    } catch (error) {
      replayRejected = error instanceof Error && (error.message === "UNAUTHORIZED" || (error as Error & { status?: number }).status === 401);
    }
    if (!replayRejected) throw new Error("Expired refresh replay was not rejected.");

    const revoked = await prisma.mobileDeviceSession.findUniqueOrThrow({ where: { id: session.id } });
    if (!revoked.revokedAt) throw new Error("True refresh replay did not revoke the session.");

    console.log(JSON.stringify({
      normalRotation: "PASSED",
      lostResponseRetryRecovery: "PASSED",
      trueReplayRejection: "PASSED",
      retryCount: history.retryCount,
      appVersion: session.appVersion,
      executionMode: liveBaseUrl ? "LIVE_HTTP" : "DIRECT",
    }));
  } finally {
    if (companyId) {
      await prisma.securityEvent.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
