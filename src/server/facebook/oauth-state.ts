import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { prisma } from "@/server/db";

type FacebookOAuthState = {
  typ: "facebook_pages_oauth";
  userId: string;
  companyId: string;
  platform: "ANDROID" | "IOS" | "WEB" | "UNKNOWN";
  iat: number;
  exp: number;
  nonce: string;
};

const STATE_TTL_SECONDS = 10 * 60;

function stateHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stateSecret() {
  const secret = process.env.FACEBOOK_OAUTH_STATE_SECRET
    || process.env.AUTH_SECRET
    || process.env.NEXTAUTH_SECRET
    || process.env.PASSWORD_PEPPER;
  if (!secret || secret.length < 32) throw new Error("FACEBOOK_OAUTH_STATE_SECRET_NOT_CONFIGURED");
  return secret;
}

function sign(body: string) {
  return createHmac("sha256", stateSecret()).update(body).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createFacebookOAuthState(input: Pick<FacebookOAuthState, "userId" | "companyId" | "platform">) {
  const now = Math.floor(Date.now() / 1000);
  const payload: FacebookOAuthState = {
    typ: "facebook_pages_oauth",
    ...input,
    iat: now,
    exp: now + STATE_TTL_SECONDS,
    nonce: randomUUID(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyFacebookOAuthState(value: string): FacebookOAuthState {
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra || !safeEqual(signature, sign(body))) throw new Error("FACEBOOK_OAUTH_STATE_INVALID");
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<FacebookOAuthState>;
    const now = Math.floor(Date.now() / 1000);
    const valid = payload.typ === "facebook_pages_oauth"
      && typeof payload.userId === "string" && payload.userId.length > 0
      && typeof payload.companyId === "string" && payload.companyId.length > 0
      && ["ANDROID", "IOS", "WEB", "UNKNOWN"].includes(payload.platform || "")
      && typeof payload.iat === "number" && payload.iat <= now + 60
      && typeof payload.exp === "number" && payload.exp > now && payload.exp - payload.iat <= STATE_TTL_SECONDS
      && typeof payload.nonce === "string" && payload.nonce.length >= 16;
    if (!valid) throw new Error("FACEBOOK_OAUTH_STATE_INVALID");
    return payload as FacebookOAuthState;
  } catch {
    throw new Error("FACEBOOK_OAUTH_STATE_INVALID");
  }
}

export async function registerFacebookOAuthState(value: string) {
  const payload = verifyFacebookOAuthState(value);
  await prisma.facebookOAuthTransaction.create({
    data: {
      stateHash: stateHash(value),
      companyId: payload.companyId,
      userId: payload.userId,
      platform: payload.platform,
      expiresAt: new Date(payload.exp * 1000),
    },
  });
  return payload;
}

export async function verifyAndConsumeFacebookOAuthState(value: string) {
  const payload = verifyFacebookOAuthState(value);
  const now = new Date();
  const consumed = await prisma.facebookOAuthTransaction.updateMany({
    where: {
      stateHash: stateHash(value),
      companyId: payload.companyId,
      userId: payload.userId,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) throw new Error("FACEBOOK_OAUTH_STATE_REPLAYED");
  return payload;
}
