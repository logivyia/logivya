import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { MobilePlatform, type Company, type CompanyUser, type Prisma, type User } from "@prisma/client";
import { prisma } from "@/server/db";
import { hashOpaqueToken } from "@/server/security/authentication";
import { decryptSensitiveField, encryptSensitiveField, parseEncryptedField, serializeEncryptedField, type EncryptionKeyring } from "@/server/security/encryption";
import { evaluateMfaLoginDecision, isMfaMethodType, resolveMfaLoginDecision } from "@/server/security/mfa-policy";

const ACCESS_TOKEN_SECONDS = 15 * 60;
const REFRESH_TOKEN_DAYS = 30;
const ACCESS_TOKEN_ISSUER = "logivya";
const ACCESS_TOKEN_AUDIENCE = "logivya-mobile";
const CLOCK_SKEW_SECONDS = 60;
const REFRESH_RETRY_GRACE_MS = 90_000;

function refreshRecoveryKeyring(): EncryptionKeyring {
  const activeVersion = (process.env.MOBILE_REFRESH_RECOVERY_ACTIVE_VERSION || "v1").toLowerCase();
  const encoded = process.env[`MOBILE_REFRESH_RECOVERY_KEY_${activeVersion.toUpperCase()}`];
  if (!encoded) throw new Error("MOBILE_REFRESH_RECOVERY_KEY_NOT_CONFIGURED");
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32) throw new Error("MOBILE_REFRESH_RECOVERY_KEY_NOT_CONFIGURED");
  return { activeVersion, keys: { [activeVersion]: key } };
}

function encryptRefreshRecoveryToken(value: string) {
  return serializeEncryptedField(encryptSensitiveField(value, refreshRecoveryKeyring()));
}

function decryptRefreshRecoveryToken(value: string) {
  return decryptSensitiveField(parseEncryptedField(value), refreshRecoveryKeyring());
}

type AccessPayload = {
  typ: "mobile_access";
  iss: typeof ACCESS_TOKEN_ISSUER;
  aud: typeof ACCESS_TOKEN_AUDIENCE;
  jti: string;
  sub: string;
  companyId: string;
  sessionId: string;
  role: string;
  iat: number;
  exp: number;
};

export type MobileAuthContext = {
  user: User;
  company: Company;
  membership: CompanyUser;
  sessionId: string;
  sessionCreatedAt: Date;
  deviceId: string;
  platform: MobilePlatform;
};

export function parseMobilePlatform(value: unknown): MobilePlatform {
  const normalized = typeof value === "string" ? value.toUpperCase() : "";
  if (normalized === "IOS") return MobilePlatform.IOS;
  if (normalized === "ANDROID") return MobilePlatform.ANDROID;
  if (normalized === "WEB") return MobilePlatform.WEB;
  return MobilePlatform.UNKNOWN;
}

function mobileJwtSecret() {
  const secret = process.env.MOBILE_JWT_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.PASSWORD_PEPPER;
  if (!secret) throw new Error("MOBILE_AUTH_SECRET_MISSING");
  return secret;
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function sign(input: string) {
  return createHmac("sha256", mobileJwtSecret()).update(input).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createAccessToken(input: { userId: string; companyId: string; sessionId: string; role: string }) {
  const now = Math.floor(Date.now() / 1000);
  const accessTokenExpiresAt = new Date((now + ACCESS_TOKEN_SECONDS) * 1000).toISOString();
  const payload: AccessPayload = {
    typ: "mobile_access",
    iss: ACCESS_TOKEN_ISSUER,
    aud: ACCESS_TOKEN_AUDIENCE,
    jti: randomUUID(),
    sub: input.userId,
    companyId: input.companyId,
    sessionId: input.sessionId,
    role: input.role,
    iat: now,
    exp: now + ACCESS_TOKEN_SECONDS,
  };
  const body = `${encodeJson({ alg: "HS256", typ: "JWT" })}.${encodeJson(payload)}`;
  return { accessToken: `${body}.${sign(body)}`, accessTokenExpiresAt, expiresIn: ACCESS_TOKEN_SECONDS };
}

export function verifyAccessToken(token: string): AccessPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("UNAUTHORIZED");
  const [header, payload, signature] = parts;
  const expected = sign(`${header}.${payload}`);
  if (!safeEqual(signature, expected)) throw new Error("UNAUTHORIZED");
  try {
    const parsedHeader = decodeJson(header) as Record<string, unknown>;
    const parsed = decodeJson(payload) as Partial<AccessPayload>;
    const now = Math.floor(Date.now() / 1000);
    const validHeader = parsedHeader.alg === "HS256" && parsedHeader.typ === "JWT";
    const validClaims = parsed.typ === "mobile_access"
      && parsed.iss === ACCESS_TOKEN_ISSUER
      && parsed.aud === ACCESS_TOKEN_AUDIENCE
      && typeof parsed.jti === "string" && parsed.jti.length >= 16
      && typeof parsed.sub === "string" && parsed.sub.length > 0
      && typeof parsed.companyId === "string" && parsed.companyId.length > 0
      && typeof parsed.sessionId === "string" && parsed.sessionId.length > 0
      && typeof parsed.role === "string" && parsed.role.length > 0
      && typeof parsed.iat === "number" && Number.isInteger(parsed.iat)
      && typeof parsed.exp === "number" && Number.isInteger(parsed.exp)
      && parsed.iat <= now + CLOCK_SKEW_SECONDS
      && parsed.exp > now
      && parsed.exp > parsed.iat
      && parsed.exp - parsed.iat <= ACCESS_TOKEN_SECONDS;
    if (!validHeader || !validClaims) throw new Error("UNAUTHORIZED");
    return parsed as AccessPayload;
  } catch {
    throw new Error("UNAUTHORIZED");
  }
}

export function createRefreshToken() {
  const token = randomBytes(48).toString("base64url");
  return { token, tokenHash: hashOpaqueToken(token), expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 86_400_000) };
}

async function mobileSessionSatisfiesMfaPolicy(tx: Prisma.TransactionClient, input: {
  userId: string;
  companyId: string;
  role: string;
  legacyRequired: boolean;
  preferredMethod?: string | null;
  mfaVerifiedAt?: Date | null;
}) {
  const company = await tx.company.findUnique({ where: { id: input.companyId }, select: { mfaPolicy: true } });
  if (!company) return false;
  const credentials = await tx.mfaCredential.findMany({
    where: { userId: input.userId, status: "ENABLED", verifiedAt: { not: null }, revokedAt: null },
    select: { type: true },
  });
  const decision = evaluateMfaLoginDecision({
    enabledMethods: credentials.map((credential) => credential.type).filter(isMfaMethodType),
    companyPolicy: company.mfaPolicy,
    role: input.role,
    legacyRequired: input.legacyRequired,
    preferredMethod: input.preferredMethod,
  });
  return !decision.mfaRequired || (Boolean(input.mfaVerifiedAt) && decision.policySatisfied);
}

export async function createMobileSession(input: {
  userId: string;
  companyId: string;
  role: string;
  deviceId: string;
  platform: MobilePlatform;
  appVersion?: string | null;
  userAgent?: string | null;
  mfaVerified?: boolean;
}) {
  mobileJwtSecret();
  const refresh = createRefreshToken();
  const session = await prisma.$transaction(async (tx) => {
    const [user, membership] = await Promise.all([
      tx.user.findUnique({ where: { id: input.userId }, select: { status: true, mustChangePassword: true } }),
      tx.companyUser.findUnique({
        where: { companyId_userId: { companyId: input.companyId, userId: input.userId } },
        select: { status: true, role: true },
      }),
    ]);
    if (
      !user
      || user.status !== "ACTIVE"
      || user.mustChangePassword
      || membership?.status !== "ACTIVE"
      || membership.role !== input.role
    ) throw new Error("FORBIDDEN");
    await tx.mobileDeviceSession.updateMany({
      where: { userId: input.userId, companyId: input.companyId, deviceId: input.deviceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return tx.mobileDeviceSession.create({
      data: {
        userId: input.userId,
        companyId: input.companyId,
        deviceId: input.deviceId,
        platform: input.platform,
        appVersion: input.appVersion,
        userAgent: input.userAgent,
        refreshTokenHash: refresh.tokenHash,
        expiresAt: refresh.expiresAt,
        mfaVerifiedAt: input.mfaVerified ? new Date() : null,
      },
    });
  });
  const access = createAccessToken({ userId: input.userId, companyId: input.companyId, sessionId: session.id, role: input.role });
  return {
    ...access,
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
    refreshExpiresAt: refresh.expiresAt,
    tokenType: "Bearer" as const,
  };
}

export async function rotateRefreshToken(refreshToken: string, request: Request) {
  const refresh = createRefreshToken();
  const replacementTokenEncrypted = encryptRefreshRecoveryToken(refresh.token);
  const incomingHash = hashOpaqueToken(refreshToken);
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mobile-refresh:${incomingHash}`}))`;
    const existing = await tx.mobileDeviceSession.findUnique({
      where: { refreshTokenHash: incomingHash },
      include: { user: true },
    });
    if (!existing) {
      const replay = await tx.mobileRefreshTokenHistory.findUnique({
        where: { tokenHash: incomingHash },
        include: { session: { include: { user: true } } },
      });
      if (!replay) return { kind: "missing" as const };

      const membership = await tx.companyUser.findUnique({
        where: { companyId_userId: { companyId: replay.session.companyId, userId: replay.session.userId } },
      });
      const mfaSatisfied = membership?.status === "ACTIVE" && await mobileSessionSatisfiesMfaPolicy(tx, {
        userId: replay.session.userId,
        companyId: replay.session.companyId,
        role: membership.role,
        legacyRequired: replay.session.user.mfaRequired,
        preferredMethod: replay.session.user.preferredMfaMethod,
        mfaVerifiedAt: replay.session.mfaVerifiedAt,
      });
      let recoveredRefreshToken: string | null = null;
      if (
        replay.replacementTokenEncrypted
        && replay.recoveryExpiresAt
        && replay.recoveryExpiresAt > now
        && !replay.session.revokedAt
        && replay.session.expiresAt > now
        && replay.session.user.status === "ACTIVE"
        && !replay.session.user.mustChangePassword
        && membership?.status === "ACTIVE"
        && mfaSatisfied
      ) {
        try {
          const candidate = decryptRefreshRecoveryToken(replay.replacementTokenEncrypted);
          if (hashOpaqueToken(candidate) === replay.session.refreshTokenHash) recoveredRefreshToken = candidate;
        } catch {
          recoveredRefreshToken = null;
        }
      }

      if (recoveredRefreshToken && membership) {
        await tx.mobileRefreshTokenHistory.update({
          where: { id: replay.id },
          data: { retryAcceptedAt: now, retryCount: { increment: 1 } },
        });
        await tx.mobileDeviceSession.update({
          where: { id: replay.sessionId },
          data: { lastUsedAt: now },
        });
        return {
          kind: "recovered" as const,
          companyId: replay.session.companyId,
          userId: replay.session.userId,
          sessionId: replay.sessionId,
          role: membership.role,
          refreshToken: recoveredRefreshToken,
          refreshExpiresAt: replay.session.expiresAt,
        };
      }

      await tx.mobileRefreshTokenHistory.update({
        where: { id: replay.id },
        data: { replayDetectedAt: now, replacementTokenEncrypted: null },
      });
      await tx.mobileDeviceSession.updateMany({
        where: { id: replay.sessionId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.trustedDevice.updateMany({
        where: { userId: replay.session.userId, deviceFingerprint: replay.session.deviceId, revokedAt: null },
        data: { revokedAt: now },
      });
      return {
        kind: "replay" as const,
        companyId: replay.session.companyId,
        userId: replay.session.userId,
        sessionId: replay.sessionId,
      };
    }
    if (existing.revokedAt || existing.expiresAt <= now) {
      return { kind: "rejected" as const, companyId: existing.companyId, userId: existing.userId, sessionId: existing.id };
    }
    const membership = await tx.companyUser.findUnique({
      where: { companyId_userId: { companyId: existing.companyId, userId: existing.userId } },
    });
    if (!membership || membership.status !== "ACTIVE" || existing.user.status !== "ACTIVE" || existing.user.mustChangePassword) {
      return { kind: "rejected" as const, companyId: existing.companyId, userId: existing.userId, sessionId: existing.id };
    }
    const mfaSatisfied = await mobileSessionSatisfiesMfaPolicy(tx, {
      userId: existing.userId,
      companyId: existing.companyId,
      role: membership.role,
      legacyRequired: existing.user.mfaRequired,
      preferredMethod: existing.user.preferredMfaMethod,
      mfaVerifiedAt: existing.mfaVerifiedAt,
    });
    if (!mfaSatisfied) {
      return { kind: "rejected" as const, companyId: existing.companyId, userId: existing.userId, sessionId: existing.id };
    }
    await tx.mobileRefreshTokenHistory.deleteMany({ where: { sessionId: existing.id, expiresAt: { lte: now } } });
    await tx.mobileRefreshTokenHistory.create({
      data: {
        sessionId: existing.id,
        tokenHash: incomingHash,
        expiresAt: existing.expiresAt,
        consumedAt: now,
        replacementTokenEncrypted,
        recoveryExpiresAt: new Date(now.getTime() + REFRESH_RETRY_GRACE_MS),
      },
    });
    const session = await tx.mobileDeviceSession.update({
      where: { id: existing.id },
      data: { refreshTokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt, lastUsedAt: now },
    });
    return {
      kind: "rotated" as const,
      userId: existing.userId,
      companyId: existing.companyId,
      sessionId: session.id,
      role: membership.role,
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  });

  if (result.kind === "replay") {
    const { tryRecordSecurityEvent } = await import("@/server/security/events");
    await tryRecordSecurityEvent({
      request,
      companyId: result.companyId,
      userId: result.userId,
      severity: "CRITICAL",
      type: "AUTH_REFRESH_TOKEN_REPLAY_DETECTED",
      message: "A previously consumed mobile refresh token was replayed and its session was revoked.",
      result: "DENIED",
      source: "mobile-auth",
      metadata: { sessionId: result.sessionId },
    });
    throw new Error("UNAUTHORIZED");
  }
  if (result.kind === "rejected") {
    const { tryRecordSecurityEvent } = await import("@/server/security/events");
    await tryRecordSecurityEvent({
      request,
      companyId: result.companyId,
      userId: result.userId,
      severity: "HIGH",
      type: "AUTH_REFRESH_TOKEN_REJECTED",
      message: "A revoked, expired, or ineligible mobile refresh token was rejected.",
      result: "DENIED",
      source: "mobile-auth",
      metadata: { sessionId: result.sessionId },
    });
    throw new Error("UNAUTHORIZED");
  }
  if (result.kind === "missing") throw new Error("UNAUTHORIZED");
  if (result.kind === "recovered") {
    const { tryRecordSecurityEvent } = await import("@/server/security/events");
    await tryRecordSecurityEvent({
      request,
      companyId: result.companyId,
      userId: result.userId,
      severity: "INFO",
      type: "AUTH_REFRESH_TOKEN_RETRY_RECOVERED",
      message: "A repeated mobile refresh request was recovered without revoking the active session.",
      result: "ALLOWED",
      source: "mobile-auth",
      metadata: { sessionId: result.sessionId },
    });
  }
  const access = createAccessToken({ userId: result.userId, companyId: result.companyId, sessionId: result.sessionId, role: result.role });
  return {
    ...access,
    refreshToken: result.refreshToken,
    refreshTokenExpiresAt: result.refreshExpiresAt.toISOString(),
    refreshExpiresAt: result.refreshExpiresAt,
    tokenType: "Bearer" as const,
  };
}

export async function revokeRefreshToken(refreshToken: string) {
  await prisma.mobileDeviceSession.updateMany({
    where: { refreshTokenHash: hashOpaqueToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function requireMobileAuth(request: Request): Promise<MobileAuthContext> {
  const header = request.headers.get("authorization") || "";
  const [, token] = header.match(/^Bearer\s+(.+)$/i) ?? [];
  if (!token) throw new Error("UNAUTHORIZED");
  const payload = verifyAccessToken(token);
  const session = await prisma.mobileDeviceSession.findUnique({
    where: { id: payload.sessionId },
    include: { user: true, company: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) throw new Error("UNAUTHORIZED");
  if (
    session.userId !== payload.sub
    || session.companyId !== payload.companyId
    || session.user.status !== "ACTIVE"
    || session.user.mustChangePassword
  ) throw new Error("UNAUTHORIZED");
  const membership = await prisma.companyUser.findUnique({
    where: { companyId_userId: { companyId: session.companyId, userId: session.userId } },
  });
  if (!membership || membership.status !== "ACTIVE") throw new Error("UNAUTHORIZED");
  const mfa = await resolveMfaLoginDecision({
    userId: session.userId,
    companyPolicy: session.company.mfaPolicy,
    role: membership.role,
    legacyRequired: session.user.mfaRequired,
    preferredMethod: session.user.preferredMfaMethod,
  });
  if (mfa.mfaRequired && (!session.mfaVerifiedAt || !mfa.policySatisfied)) throw new Error("UNAUTHORIZED");
  await prisma.mobileDeviceSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date(), userAgent: request.headers.get("user-agent") } });
  return { user: session.user, company: session.company, membership, sessionId: session.id, sessionCreatedAt: session.createdAt, deviceId: session.deviceId, platform: session.platform };
}
