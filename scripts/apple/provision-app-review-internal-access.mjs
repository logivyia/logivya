import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  appStoreConnectRequest,
  loadAppleConfiguration,
  repoRoot,
} from "./app-store-connect-client.mjs";

if (process.env.ALLOW_APP_REVIEW_INTERNAL_ACCESS !== "YES") {
  throw new Error("Set ALLOW_APP_REVIEW_INTERNAL_ACCESS=YES after explicit release approval.");
}

const metadata = JSON.parse(readFileSync(
  path.join(repoRoot, "packages", "docs", "production-release", "apple", "app-store-metadata.json"),
  "utf8",
));
const configuration = loadAppleConfiguration();
const versions = await appStoreConnectRequest(
  configuration,
  `/v1/apps/${configuration.appStoreAppId}/appStoreVersions`,
  { "filter[platform]": "IOS", "filter[versionString]": metadata.version, limit: 10 },
);
const version = (versions.payload?.data || []).find(
  (entry) => entry.attributes?.versionString === metadata.version,
);
if (!version?.id) throw new Error("APP_STORE_VERSION_NOT_FOUND");
const detail = await appStoreConnectRequest(
  configuration,
  `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`,
);
const identifier = detail.payload?.data?.attributes?.demoAccountName?.trim();
const password = detail.payload?.data?.attributes?.demoAccountPassword;
if (!identifier || !password) throw new Error("APP_REVIEW_CREDENTIALS_NOT_CONFIGURED");

const apiOrigin = new URL(process.env.APP_REVIEW_API_ORIGIN || "https://www.logivya.com").origin;
const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "X-Client-Platform": "ios",
  "X-Logivya-App-Version": metadata.version,
  "X-Logivya-Version-Code": "175",
};
const loginResponse = await fetch(new URL("/api/mobile/auth/login", apiOrigin), {
  method: "POST",
  headers,
  body: JSON.stringify({
    identifier,
    password,
    deviceId: "app-review-internal-access-provision",
    platform: "ios",
    appVersion: metadata.version,
  }),
  signal: AbortSignal.timeout(20_000),
});
const login = await loginResponse.json();
const accessToken = login?.data?.tokens?.accessToken;
if (!loginResponse.ok || login?.success !== true || login?.data?.mfaRequired === true || !accessToken) {
  throw new Error("APP_REVIEW_LOGIN_FAILED");
}
const meResponse = await fetch(new URL("/api/mobile/auth/me", apiOrigin), {
  headers: { ...headers, Authorization: `Bearer ${accessToken}` },
  signal: AbortSignal.timeout(20_000),
});
const me = await meResponse.json();
const userId = me?.data?.user?.id;
if (!meResponse.ok || me?.success !== true || !/^[a-z0-9_-]{10,80}$/iu.test(userId || "")) {
  throw new Error("APP_REVIEW_USER_ID_NOT_RESOLVED");
}

const remoteProgram = `
(async () => {
  const { randomUUID } = require('node:crypto');
  const { readFileSync } = require('node:fs');
  const { Client } = require('pg');
  const client = new Client({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD || readFileSync('/run/secrets/postgres_password', 'utf8').trim(),
    database: process.env.POSTGRES_DB,
  });
  await client.connect();
  try {
    const userId = process.env.APP_REVIEW_USER_ID;
    await client.query('BEGIN');
    const userResult = await client.query('SELECT status::text AS status FROM "User" WHERE id = $1 FOR UPDATE', [userId]);
    const user = userResult.rows[0];
    if (!user || user.status !== 'ACTIVE') throw new Error('APP_REVIEW_USER_NOT_ACTIVE');
    const required = ['freight_marketplace_internal_access', 'telegram_internal_access'];
    const existingResult = await client.query('SELECT role::text AS role, permissions FROM "PlatformAdmin" WHERE "userId" = $1 FOR UPDATE', [userId]);
    const existing = existingResult.rows[0];
    const permissions = [...new Set([...(existing?.permissions || []), ...required])].sort();
    const adminResult = existing
      ? await client.query(
          'UPDATE "PlatformAdmin" SET permissions = $2::text[], "isActive" = true, "requiresMfa" = false, "updatedAt" = now() WHERE "userId" = $1 RETURNING role::text AS role, permissions, "isActive", "requiresMfa"',
          [userId, permissions],
        )
      : await client.query(
          'INSERT INTO "PlatformAdmin" (id, "userId", role, permissions, "isActive", "requiresMfa", "createdAt", "updatedAt") VALUES ($1, $2, \\'READ_ONLY_ADMIN\\'::"PlatformAdminRole", $3::text[], true, false, now(), now()) RETURNING role::text AS role, permissions, "isActive", "requiresMfa"',
          ['appreview_' + randomUUID().replaceAll('-', ''), userId, permissions],
        );
    const admin = adminResult.rows[0];
    await client.query('COMMIT');
    console.log(JSON.stringify({
      ok: true,
      created: !existing,
      role: admin.role,
      isActive: admin.isActive,
      requiresMfa: admin.requiresMfa,
      freightPermission: admin.permissions.includes(required[0]),
      telegramPermission: admin.permissions.includes(required[1]),
    }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
})().catch((error) => { console.error(JSON.stringify({ ok: false, name: error?.name || null, code: error?.code || null, error: error?.message || String(error) })); process.exit(1); });
`;
const encodedProgram = Buffer.from(remoteProgram, "utf8").toString("base64");
const sshTarget = process.env.LOGIVYA_PRODUCTION_SSH_TARGET || "deploy@167.233.249.193";
const remoteCommand = [
  "sudo docker exec",
  `-e APP_REVIEW_USER_ID=${userId}`,
  "logivya-web node -e",
  '"eval(Buffer.from(process.argv[1],\'base64\').toString(\'utf8\'))"',
  encodedProgram,
].join(" ");
const result = spawnSync("ssh", [
  "-o", "BatchMode=yes",
  "-o", "ConnectTimeout=10",
  sshTarget,
  remoteCommand,
], { cwd: repoRoot, encoding: "utf8", env: process.env });
if (result.status !== 0) {
  throw new Error(`APP_REVIEW_REMOTE_PROVISION_FAILED:${result.stderr.trim() || result.stdout.trim()}`);
}
const output = result.stdout.trim().split(/\r?\n/u).at(-1);
const provisioned = JSON.parse(output || "{}");
if (!provisioned.ok || !provisioned.freightPermission || !provisioned.telegramPermission) {
  throw new Error("APP_REVIEW_PERMISSIONS_NOT_VERIFIED");
}
console.log(JSON.stringify({ ok: true, version: metadata.version, ...provisioned }, null, 2));
