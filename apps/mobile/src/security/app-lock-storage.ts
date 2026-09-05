import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import {
  APP_LOCK_HASH_ROUNDS,
  getAppLockBlockDurationMs,
  isSupportedAutoLockSeconds,
  isValidAppLockPin,
  type AppLockAutoLockSeconds,
} from "@/security/app-lock-policy";

const APP_LOCK_STORAGE_PREFIX = "logivya.v1.localAppLock";
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export type StoredAppLock = {
  version: 1;
  userId: string;
  enabled: true;
  pinHash: string;
  salt: string;
  hashRounds: number;
  biometricEnabled: boolean;
  autoLockSeconds: AppLockAutoLockSeconds;
  appSwitcherPrivacyEnabled: boolean;
  failedAttempts: number;
  blockedUntil: number | null;
};

export type AppLockVerification =
  | { success: true; config: StoredAppLock }
  | { success: false; reason: "INVALID" | "BLOCKED" | "NOT_CONFIGURED"; blockedUntil: number | null };

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function derivePinHash(userId: string, pin: string, salt: string, rounds = APP_LOCK_HASH_ROUNDS) {
  let digest = `${userId}|${salt}|${pin}|logivya-local-app-lock-v1`;
  for (let index = 0; index < rounds; index += 1) {
    digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, digest);
  }
  return digest;
}

async function storageKeyForUser(userId: string) {
  const userHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, userId);
  return `${APP_LOCK_STORAGE_PREFIX}.${userHash.slice(0, 32)}`;
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function isStoredAppLock(value: unknown): value is StoredAppLock {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredAppLock>;
  return candidate.version === 1
    && candidate.enabled === true
    && typeof candidate.userId === "string"
    && typeof candidate.pinHash === "string"
    && typeof candidate.salt === "string"
    && typeof candidate.hashRounds === "number"
    && typeof candidate.biometricEnabled === "boolean"
    && typeof candidate.appSwitcherPrivacyEnabled === "boolean"
    && typeof candidate.failedAttempts === "number"
    && (candidate.blockedUntil === null || typeof candidate.blockedUntil === "number")
    && typeof candidate.autoLockSeconds === "number"
    && isSupportedAutoLockSeconds(candidate.autoLockSeconds);
}

async function persist(config: StoredAppLock) {
  await SecureStore.setItemAsync(await storageKeyForUser(config.userId), JSON.stringify(config), secureStoreOptions);
  return config;
}

export async function readStoredAppLock(userId: string) {
  const storageKey = await storageKeyForUser(userId);
  const raw = await SecureStore.getItemAsync(storageKey, secureStoreOptions);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredAppLock(parsed) || parsed.userId !== userId) return null;
    return parsed;
  } catch {
    await SecureStore.deleteItemAsync(storageKey, secureStoreOptions);
    return null;
  }
}

export async function createStoredAppLock(userId: string, pin: string): Promise<StoredAppLock> {
  if (!userId || !isValidAppLockPin(pin)) throw new Error("INVALID_APP_LOCK_CONFIGURATION");
  const salt = bytesToHex(await Crypto.getRandomBytesAsync(32));
  return persist({
    version: 1,
    userId,
    enabled: true,
    pinHash: await derivePinHash(userId, pin, salt),
    salt,
    hashRounds: APP_LOCK_HASH_ROUNDS,
    biometricEnabled: false,
    autoLockSeconds: 60,
    appSwitcherPrivacyEnabled: true,
    failedAttempts: 0,
    blockedUntil: null,
  });
}

export async function verifyStoredAppLockPin(userId: string, pin: string, now = Date.now()): Promise<AppLockVerification> {
  const config = await readStoredAppLock(userId);
  if (!config) return { success: false, reason: "NOT_CONFIGURED", blockedUntil: null };
  if (config.blockedUntil && config.blockedUntil > now) {
    return { success: false, reason: "BLOCKED", blockedUntil: config.blockedUntil };
  }

  const candidate = isValidAppLockPin(pin)
    ? await derivePinHash(userId, pin, config.salt, config.hashRounds)
    : "";
  if (constantTimeEqual(candidate, config.pinHash)) {
    const verified = await persist({ ...config, failedAttempts: 0, blockedUntil: null });
    return { success: true, config: verified };
  }

  const failedAttempts = config.failedAttempts + 1;
  const blockDuration = getAppLockBlockDurationMs(failedAttempts);
  const blockedUntil = blockDuration ? now + blockDuration : null;
  await persist({ ...config, failedAttempts, blockedUntil });
  return { success: false, reason: blockedUntil ? "BLOCKED" : "INVALID", blockedUntil };
}

export async function updateStoredAppLock(userId: string, patch: Partial<Pick<StoredAppLock, "biometricEnabled" | "autoLockSeconds" | "appSwitcherPrivacyEnabled">>) {
  const config = await readStoredAppLock(userId);
  if (!config) throw new Error("APP_LOCK_NOT_CONFIGURED");
  if (patch.autoLockSeconds !== undefined && !isSupportedAutoLockSeconds(patch.autoLockSeconds)) {
    throw new Error("INVALID_AUTO_LOCK_INTERVAL");
  }
  return persist({ ...config, ...patch });
}

export async function changeStoredAppLockPin(
  userId: string,
  currentPin: string,
  nextPin: string,
): Promise<AppLockVerification> {
  const verification = await verifyStoredAppLockPin(userId, currentPin);
  if (!verification.success) return verification;
  if (!isValidAppLockPin(nextPin)) return { success: false, reason: "INVALID" as const, blockedUntil: null };
  const salt = bytesToHex(await Crypto.getRandomBytesAsync(32));
  const config = await persist({
    ...verification.config,
    pinHash: await derivePinHash(userId, nextPin, salt),
    salt,
    hashRounds: APP_LOCK_HASH_ROUNDS,
    failedAttempts: 0,
    blockedUntil: null,
  });
  return { success: true as const, config };
}

export async function clearStoredAppLock(userId?: string) {
  if (!userId) return;
  await SecureStore.deleteItemAsync(await storageKeyForUser(userId), secureStoreOptions);
}
