import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { MobilePlatform, type Company, type CompanyUser, type User } from "@prisma/client";
import { prisma } from "@/server/db";
import { hashOpaqueToken } from "@/server/security/authentication";

const ACCESS_TOKEN_SECONDS = 15 * 60;
const REFRESH_TOKEN_DAYS = 30;

type AccessPayload = {
  typ: "mobile_access";
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
  const payload: AccessPayload = {
    typ: "mobile_access",
    sub: input.userId,
    companyId: input.companyId,
    sessionId: input.sessionId,
    role: input.role,
    iat: now,
    exp: now + ACCESS_TOKEN_SECONDS,
  };
  const body = `${encodeJson({ alg: "HS256", typ: "JWT" })}.${encodeJson(payload)}`;
  return { accessToken: `${body}.${sign(body)}`, expiresIn: ACCESS_TOKEN_SECONDS };
}

export function verifyAccessToken(token: string): AccessPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("UNAUTHORIZED");
  const [header, payload, signature] = parts;
  const expected = sign(`${header}.${payload}`);
  if (!safeEqual(signature, expected)) throw new Error("UNAUTHORIZED");
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AccessPayload;
  if (parsed.typ !== "mobile_access" || parsed.exp <= Math.floor(Date.now() / 1000)) throw new Error("UNAUTHORIZED");
  return parsed;
}

export function createRefreshToken() {
  const token = randomBytes(48).toString("base64url");
  return { token, tokenHash: hashOpaqueToken(token), expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 86_400_000) };
}

export async function createMobileSession(input: {
  userId: string;
  companyId: string;
  role: string;
  deviceId: string;
  platform: MobilePlatform;
  appVersion?: string | null;
  userAgent?: string | null;
}) {
  const refresh = createRefreshToken();
  await prisma.mobileDeviceSession.updateMany({
    where: { userId: input.userId, companyId: input.companyId, deviceId: input.deviceId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const session = await prisma.mobileDeviceSession.create({
    data: {
      userId: input.userId,
      companyId: input.companyId,
      deviceId: input.deviceId,
      platform: input.platform,
      appVersion: input.appVersion,
      userAgent: input.userAgent,
      refreshTokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt,
    },
  });
  const access = createAccessToken({ userId: input.userId, companyId: input.companyId, sessionId: session.id, role: input.role });
  return { ...access, refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt, tokenType: "Bearer" as const };
}

export async function rotateRefreshToken(refreshToken: string, request: Request) {
  const refresh = createRefreshToken();
  const existing = await prisma.mobileDeviceSession.findUnique({
    where: { refreshTokenHash: hashOpaqueToken(refreshToken) },
    include: { user: true, company: true },
  });
  if (!existing) throw new Error("UNAUTHORIZED");
  if (existing.revokedAt || existing.expiresAt <= new Date()) {
    await prisma.securityEvent.create({
      data: {
        companyId: existing.companyId,
        userId: existing.userId,
        severity: "HIGH",
        type: "MOBILE_REFRESH_TOKEN_REUSE_OR_EXPIRED",
        message: "Mobil refresh token geçersiz veya daha önce iptal edilmiş.",
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
        userAgent: request.headers.get("user-agent"),
      },
    });
    throw new Error("UNAUTHORIZED");
  }
  const membership = await prisma.companyUser.findUnique({
    where: { companyId_userId: { companyId: existing.companyId, userId: existing.userId } },
  });
  if (!membership || membership.status !== "ACTIVE" || existing.user.status !== "ACTIVE") throw new Error("UNAUTHORIZED");
  const session = await prisma.mobileDeviceSession.update({
    where: { id: existing.id },
    data: { refreshTokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt, lastUsedAt: new Date() },
  });
  const access = createAccessToken({ userId: existing.userId, companyId: existing.companyId, sessionId: session.id, role: membership.role });
  return { ...access, refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt, tokenType: "Bearer" as const };
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
  if (session.userId !== payload.sub || session.companyId !== payload.companyId || session.user.status !== "ACTIVE") throw new Error("UNAUTHORIZED");
  const membership = await prisma.companyUser.findUnique({
    where: { companyId_userId: { companyId: session.companyId, userId: session.userId } },
  });
  if (!membership || membership.status !== "ACTIVE") throw new Error("UNAUTHORIZED");
  await prisma.mobileDeviceSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date(), userAgent: request.headers.get("user-agent") } });
  return { user: session.user, company: session.company, membership, sessionId: session.id, deviceId: session.deviceId, platform: session.platform };
}
