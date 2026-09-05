import { createPrivateKey, sign } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const EXPECTED_BUNDLE_ID = "com.logivya.mobile";
export const EXPECTED_TEAM_ID = "YMW24BAWTV";
export const EXPECTED_APP_STORE_APP_ID = "6792539737";
export const repoRoot = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));

const ASC_API_ORIGIN = "https://api.appstoreconnect.apple.com";

export class AppleConfigurationError extends Error {}

export class AppStoreConnectError extends Error {
  constructor(message, status, codes = []) {
    super(message);
    this.status = status;
    this.codes = codes;
  }
}

function requireEnvironmentValue(name, fallbackName) {
  const value = process.env[name]?.trim() || (fallbackName ? process.env[fallbackName]?.trim() : "");
  if (!value) throw new AppleConfigurationError(`${name} is required.`);
  return value;
}

function isPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

export function loadAppleConfiguration() {
  const issuerId = requireEnvironmentValue("APP_STORE_CONNECT_ISSUER_ID", "EXPO_ASC_ISSUER_ID");
  const keyId = requireEnvironmentValue("APP_STORE_CONNECT_KEY_ID", "EXPO_ASC_KEY_ID");
  const configuredKeyPath = requireEnvironmentValue("APP_STORE_CONNECT_API_KEY_PATH", "EXPO_ASC_API_KEY_PATH");
  const appStoreAppId = requireEnvironmentValue("APP_STORE_CONNECT_APP_ID", "APP_STORE_APP_ID");
  const teamId = requireEnvironmentValue("APPLE_TEAM_ID");
  const bundleId = requireEnvironmentValue("IOS_BUNDLE_IDENTIFIER");

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(issuerId)) {
    throw new AppleConfigurationError("APP_STORE_CONNECT_ISSUER_ID must be a UUID.");
  }
  if (!/^[A-Z0-9]{10}$/u.test(keyId)) {
    throw new AppleConfigurationError("APP_STORE_CONNECT_KEY_ID must be a 10-character Apple key ID.");
  }
  if (teamId !== EXPECTED_TEAM_ID) {
    throw new AppleConfigurationError(`APPLE_TEAM_ID conflicts with the expected team (${EXPECTED_TEAM_ID}).`);
  }
  if (bundleId !== EXPECTED_BUNDLE_ID) {
    throw new AppleConfigurationError(`IOS_BUNDLE_IDENTIFIER conflicts with ${EXPECTED_BUNDLE_ID}.`);
  }
  if (!/^\d+$/u.test(appStoreAppId) || appStoreAppId !== EXPECTED_APP_STORE_APP_ID) {
    throw new AppleConfigurationError(
      `APP_STORE_CONNECT_APP_ID must identify the existing Logivya app (${EXPECTED_APP_STORE_APP_ID}).`,
    );
  }

  const keyPath = path.resolve(configuredKeyPath);
  if (path.extname(keyPath).toLowerCase() !== ".p8") {
    throw new AppleConfigurationError("APP_STORE_CONNECT_API_KEY_PATH must reference a .p8 file.");
  }
  if (!existsSync(keyPath)) {
    throw new AppleConfigurationError("The configured App Store Connect private key file does not exist.");
  }

  const resolvedKeyPath = realpathSync(keyPath);
  if (isPathInside(repoRoot, resolvedKeyPath)) {
    throw new AppleConfigurationError("The App Store Connect private key must be stored outside the Git repository.");
  }

  let privateKey;
  try {
    privateKey = createPrivateKey(readFileSync(resolvedKeyPath));
  } catch {
    throw new AppleConfigurationError("The configured .p8 file is not a readable private key.");
  }
  if (privateKey.type !== "private" || privateKey.asymmetricKeyType !== "ec") {
    throw new AppleConfigurationError("The App Store Connect key must be an EC private key.");
  }

  return {
    issuerId,
    keyId,
    keyPath: resolvedKeyPath,
    privateKey,
    teamId,
    bundleId,
    appStoreAppId,
  };
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function createAppStoreConnectJwt(configuration, lifetimeSeconds = 300) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "ES256", kid: configuration.keyId, typ: "JWT" });
  const payload = encodeJson({
    iss: configuration.issuerId,
    iat: now - 5,
    exp: now + Math.min(Math.max(lifetimeSeconds, 60), 600),
    aud: "appstoreconnect-v1",
  });
  const unsigned = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(unsigned), {
    key: configuration.privateKey,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return `${unsigned}.${signature}`;
}

function safeErrorCodes(payload) {
  if (!Array.isArray(payload?.errors)) return [];
  return payload.errors.map((error) => String(error?.code || "UNKNOWN")).slice(0, 10);
}

export async function appStoreConnectRequest(configuration, pathname, searchParams = {}, options = {}) {
  const url = new URL(pathname, ASC_API_ORIGIN);
  for (const [name, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(name, String(value));
  }

  const maxAttempts = Math.min(Math.max(Number(options.maxAttempts || 3), 1), 4);
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs || 20_000), 1_000), 60_000);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: options.method || "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${createAppStoreConnectJwt(configuration)}`,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (response.ok) return { status: response.status, payload };

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === maxAttempts) {
        throw new AppStoreConnectError("App Store Connect request failed.", response.status, safeErrorCodes(payload));
      }
      await delay(retryDelayMs(response.headers.get("retry-after"), attempt));
    } catch (error) {
      if (error instanceof AppStoreConnectError) throw error;
      if (attempt === maxAttempts) {
        throw new AppStoreConnectError("App Store Connect request could not be completed.", 0, ["NETWORK_ERROR"]);
      }
      await delay(retryDelayMs(null, attempt));
    }
  }

  throw new AppStoreConnectError("App Store Connect request could not be completed.", 0, ["NETWORK_ERROR"]);
}

export function safeConfigurationSummary(configuration) {
  return {
    bundleId: configuration.bundleId,
    teamId: configuration.teamId,
    appStoreAppId: configuration.appStoreAppId,
    keyFileName: path.basename(configuration.keyPath),
    keyStoredOutsideRepository: !isPathInside(repoRoot, configuration.keyPath),
    keyType: configuration.privateKey.asymmetricKeyType,
  };
}

function retryDelayMs(retryAfter, attempt) {
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 10_000);
  return Math.min(400 * 2 ** (attempt - 1), 4_000);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
