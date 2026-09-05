import { createHmac, createSign, randomBytes, timingSafeEqual } from "node:crypto";

import IORedis from "ioredis";

import { logger } from "@/server/observability/logger";

const PACKAGE_NAME = "com.logivya.mobile";
const CHALLENGE_TTL_SECONDS = 5 * 60;
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/playintegrity";

export type PlayIntegrityMode = "off" | "monitor" | "enforce";
export type PlayIntegrityAction = "APP_START" | "ACCOUNT_SECURITY" | "BILLING";

type ChallengePayload = {
  version: 1;
  id: string;
  action: PlayIntegrityAction;
  requestHash: string;
  issuedAt: number;
  expiresAt: number;
};

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type GoogleAccessToken = { token: string; expiresAt: number };

type IntegrityPayload = {
  requestDetails?: {
    requestPackageName?: string;
    requestHash?: string;
    timestampMillis?: string;
  };
  accountDetails?: { appLicensingVerdict?: string };
  appIntegrity?: {
    appRecognitionVerdict?: string;
    packageName?: string;
    versionCode?: string;
  };
  deviceIntegrity?: {
    deviceRecognitionVerdict?: string[];
    recentDeviceActivity?: { deviceActivityLevel?: string };
  };
  environmentDetails?: {
    playProtectVerdict?: string;
    appAccessRiskVerdict?: { appsDetected?: string[] };
  };
};

export type IntegrityEvaluation = {
  verified: boolean;
  verdict: "trusted" | "untrusted";
  reasons: string[];
  signals: {
    licensed: boolean;
    playRecognized: boolean;
    deviceIntegrity: boolean;
    playProtectClean: boolean;
    appAccessRiskFree: boolean;
  };
};

let cachedAccessToken: GoogleAccessToken | null = null;
let replayRedis: IORedis | null = null;

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function challengeSecret() {
  return process.env.PLAY_INTEGRITY_CHALLENGE_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
}

function signature(value: string) {
  const secret = challengeSecret();
  if (!secret) throw new Error("PLAY_INTEGRITY_CHALLENGE_SECRET_MISSING");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function serviceAccountCredentials() {
  const configured = process.env.GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON?.trim();
  if (!configured) return null;

  try {
    const json = configured.startsWith("{") ? configured : Buffer.from(configured, "base64").toString("utf8");
    const parsed = JSON.parse(json) as Partial<ServiceAccountCredentials>;
    if (!parsed.client_email || !parsed.private_key) return null;
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
      token_uri: parsed.token_uri || GOOGLE_TOKEN_URL,
    } satisfies ServiceAccountCredentials;
  } catch (error) {
    logger.error("play_integrity.credentials_invalid", error);
    return null;
  }
}

export function getPlayIntegrityMode(): PlayIntegrityMode {
  const configured = process.env.PLAY_INTEGRITY_MODE?.trim().toLowerCase();
  if (configured === "off" || configured === "enforce" || configured === "monitor") return configured;
  return process.env.NODE_ENV === "production" ? "monitor" : "off";
}

export function issuePlayIntegrityChallenge(action: PlayIntegrityAction) {
  const issuedAt = Date.now();
  const payload: ChallengePayload = {
    version: 1,
    id: randomBytes(18).toString("base64url"),
    action,
    requestHash: randomBytes(32).toString("base64url"),
    issuedAt,
    expiresAt: issuedAt + CHALLENGE_TTL_SECONDS * 1000,
  };
  const encoded = base64url(JSON.stringify(payload));
  return {
    challengeToken: `${encoded}.${signature(encoded)}`,
    requestHash: payload.requestHash,
    expiresAt: new Date(payload.expiresAt).toISOString(),
  };
}

export function parsePlayIntegrityChallenge(token: string, now = Date.now()) {
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra || !safeEqual(signature(encoded), suppliedSignature)) {
    throw new Error("PLAY_INTEGRITY_CHALLENGE_INVALID");
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ChallengePayload;
    if (
      payload.version !== 1 ||
      !payload.id ||
      !payload.requestHash ||
      !["APP_START", "ACCOUNT_SECURITY", "BILLING"].includes(payload.action) ||
      payload.expiresAt <= now ||
      payload.issuedAt > now + 30_000
    ) {
      throw new Error("PLAY_INTEGRITY_CHALLENGE_INVALID");
    }
    return payload;
  } catch {
    throw new Error("PLAY_INTEGRITY_CHALLENGE_INVALID");
  }
}

function getReplayRedis() {
  if (replayRedis) return replayRedis;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
  replayRedis = new IORedis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  replayRedis.on("error", (error) => logger.warn("play_integrity.replay_store_error", { message: error.message }));
  return replayRedis;
}

async function consumeChallenge(id: string) {
  const redis = getReplayRedis();
  if (!redis) return getPlayIntegrityMode() !== "enforce";
  if (redis.status === "wait") await redis.connect();
  const stored = await redis.set(`play-integrity:challenge:${id}`, "used", "EX", CHALLENGE_TTL_SECONDS, "NX");
  return stored === "OK";
}

async function googleAccessToken(credentials: ServiceAccountCredentials) {
  if (cachedAccessToken && cachedAccessToken.expiresAt - Date.now() > 60_000) return cachedAccessToken.token;

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: credentials.client_email,
    scope: GOOGLE_SCOPE,
    aud: credentials.token_uri || GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(credentials.private_key).toString("base64url")}`;

  const response = await fetch(credentials.token_uri || GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`PLAY_INTEGRITY_OAUTH_FAILED_${response.status}`);
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("PLAY_INTEGRITY_OAUTH_INVALID_RESPONSE");
  cachedAccessToken = {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(60, payload.expires_in || 3600) * 1000,
  };
  return cachedAccessToken.token;
}

async function decodeIntegrityToken(integrityToken: string) {
  const credentials = serviceAccountCredentials();
  if (!credentials) return null;
  const accessToken = await googleAccessToken(credentials);
  const response = await fetch(`https://playintegrity.googleapis.com/v1/${PACKAGE_NAME}:decodeIntegrityToken`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ integrity_token: integrityToken }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`PLAY_INTEGRITY_DECODE_FAILED_${response.status}`);
  const decoded = await response.json() as { tokenPayloadExternal?: IntegrityPayload };
  if (!decoded.tokenPayloadExternal) throw new Error("PLAY_INTEGRITY_DECODE_INVALID_RESPONSE");
  return decoded.tokenPayloadExternal;
}

export function evaluatePlayIntegrityPayload(payload: IntegrityPayload, challenge: Pick<ChallengePayload, "requestHash">): IntegrityEvaluation {
  const reasons: string[] = [];
  const packageMatches = payload.requestDetails?.requestPackageName === PACKAGE_NAME && payload.appIntegrity?.packageName === PACKAGE_NAME;
  const requestMatches = payload.requestDetails?.requestHash === challenge.requestHash;
  const timestamp = Number(payload.requestDetails?.timestampMillis);
  const timestampFresh = Number.isFinite(timestamp) && Math.abs(Date.now() - timestamp) <= CHALLENGE_TTL_SECONDS * 1000;
  const licensed = payload.accountDetails?.appLicensingVerdict === "LICENSED";
  const playRecognized = payload.appIntegrity?.appRecognitionVerdict === "PLAY_RECOGNIZED";
  const deviceIntegrity = payload.deviceIntegrity?.deviceRecognitionVerdict?.includes("MEETS_DEVICE_INTEGRITY") === true;
  const playProtectClean = payload.environmentDetails?.playProtectVerdict === "NO_ISSUES";
  const detectedApps = payload.environmentDetails?.appAccessRiskVerdict?.appsDetected ?? [];
  const appAccessRiskFree = !detectedApps.some((value) => value.includes("CAPTURING") || value.includes("CONTROLLING") || value.includes("OVERLAYS"));

  if (!packageMatches) reasons.push("PACKAGE_MISMATCH");
  if (!requestMatches) reasons.push("REQUEST_HASH_MISMATCH");
  if (!timestampFresh) reasons.push("STALE_RESPONSE");
  if (!licensed) reasons.push("UNLICENSED");
  if (!playRecognized) reasons.push("UNRECOGNIZED_APP");
  if (!deviceIntegrity) reasons.push("DEVICE_INTEGRITY_FAILED");
  if (!playProtectClean) reasons.push("PLAY_PROTECT_RISK");
  if (!appAccessRiskFree) reasons.push("APP_ACCESS_RISK");

  return {
    verified: reasons.length === 0,
    verdict: reasons.length === 0 ? "trusted" : "untrusted",
    reasons,
    signals: { licensed, playRecognized, deviceIntegrity, playProtectClean, appAccessRiskFree },
  };
}

export async function verifyPlayIntegrityToken(challengeToken: string, integrityToken: string) {
  const challenge = parsePlayIntegrityChallenge(challengeToken);
  if (!(await consumeChallenge(challenge.id))) throw new Error("PLAY_INTEGRITY_CHALLENGE_REPLAYED");
  const payload = await decodeIntegrityToken(integrityToken);
  if (!payload) {
    return {
      configured: false,
      verified: false,
      verdict: "unavailable" as const,
      reasons: ["SERVER_CREDENTIALS_MISSING"],
    };
  }
  const evaluation = evaluatePlayIntegrityPayload(payload, challenge);
  return { configured: true, ...evaluation };
}

export function resetPlayIntegrityTestState() {
  cachedAccessToken = null;
}
