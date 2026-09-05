import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import QRCode from "qrcode";
import {
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";

const apiOrigin = new URL(process.env.APP_REVIEW_API_ORIGIN || "https://www.logivya.com").origin;
const outputPath = resolve(process.cwd(), "artifacts", "app-review", "whatsapp-qr.png");

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function resolveReviewCredentials(configuration) {
  const versions = await appStoreConnectRequest(
    configuration,
    `/v1/apps/${configuration.appStoreAppId}/appStoreVersions`,
    { "filter[platform]": "IOS", limit: 50 },
  );
  const preferredStates = [
    "WAITING_FOR_REVIEW",
    "IN_REVIEW",
    "READY_FOR_REVIEW",
    "PREPARE_FOR_SUBMISSION",
    "REJECTED",
    "DEVELOPER_REJECTED",
  ];
  const version = preferredStates
    .map((state) => versions.payload?.data?.find(
      (entry) => entry.attributes?.appStoreState === state,
    ))
    .find(Boolean)
    || versions.payload?.data?.find((entry) => entry.attributes?.versionString === "1.0");
  if (!version?.id) throw new Error("APP_STORE_REVIEW_VERSION_NOT_FOUND");

  const [detail, build] = await Promise.all([
    appStoreConnectRequest(configuration, `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`),
    appStoreConnectRequest(configuration, `/v1/appStoreVersions/${version.id}/build`),
  ]);
  const identifier = detail.payload?.data?.attributes?.demoAccountName?.trim();
  const password = detail.payload?.data?.attributes?.demoAccountPassword;
  if (!identifier || !password) throw new Error("APP_REVIEW_CREDENTIALS_NOT_CONFIGURED");
  return {
    identifier,
    password,
    marketingVersion: version.attributes?.versionString || "1.0",
    buildNumber: build.payload?.data?.attributes?.version || "163",
  };
}

async function login(credentials) {
  const response = await fetch(new URL("/api/mobile/auth/login", apiOrigin), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Client-Platform": "ios",
      "X-Logivya-App-Version": credentials.marketingVersion,
      "X-Logivya-Version-Code": String(credentials.buildNumber),
    },
    body: JSON.stringify({
      identifier: credentials.identifier,
      password: credentials.password,
      deviceId: "app-review-whatsapp-provisioning",
      platform: "ios",
      appVersion: credentials.marketingVersion,
    }),
  });
  const payload = await readJson(response);
  const accessToken = payload?.data?.tokens?.accessToken;
  if (!response.ok || payload?.success !== true || !accessToken) {
    throw new Error(payload?.error?.code || `APP_REVIEW_LOGIN_HTTP_${response.status}`);
  }
  return {
    accessToken,
    marketingVersion: credentials.marketingVersion,
    buildNumber: String(credentials.buildNumber),
  };
}

async function mobileRequest(session, pathname, init = {}) {
  const response = await fetch(new URL(pathname, apiOrigin), {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${session.accessToken}`,
      "X-Client-Platform": "ios",
      "X-Logivya-App-Version": session.marketingVersion,
      "X-Logivya-Version-Code": session.buildNumber,
      ...(init.headers || {}),
    },
  });
  const payload = await readJson(response);
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.error?.code || `MOBILE_API_HTTP_${response.status}`);
  }
  return payload.data;
}

async function saveQrImage(qrCode) {
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  if (/^data:image\/png;base64,/i.test(qrCode)) {
    await writeFile(outputPath, Buffer.from(qrCode.split(",", 2)[1], "base64"));
  } else {
    await QRCode.toFile(outputPath, qrCode, { width: 480, margin: 3, errorCorrectionLevel: "M" });
  }
}

async function main() {
  const configuration = loadAppleConfiguration();
  const credentials = await resolveReviewCredentials(configuration);
  const session = await login(credentials);
  const mode = process.argv[2] || "start";

  if (mode === "status") {
    const accountId = process.argv[3]?.trim();
    if (!accountId) throw new Error("ACCOUNT_ID_REQUIRED");
    const data = await mobileRequest(session, `/api/mobile/whatsapp/accounts/${encodeURIComponent(accountId)}/status`);
    console.log(JSON.stringify({ ok: true, account: summarize(data.account || data) }));
    return;
  }

  if (mode === "phone") {
    const countryIso = process.argv[3]?.trim().toUpperCase();
    const nationalNumber = process.argv[4]?.replace(/\D/g, "");
    if (!countryIso || !nationalNumber) throw new Error("PHONE_COUNTRY_AND_NUMBER_REQUIRED");
    const data = await mobileRequest(session, "/api/mobile/whatsapp/accounts/phone-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countryIso, nationalNumber }),
    });
    const account = data.account;
    if (!account?.id) throw new Error("WHATSAPP_ACCOUNT_RESPONSE_INVALID");
    console.log(JSON.stringify({
      ok: true,
      pairingCode: account.pairingCode || null,
      pairingCodeExpiresAt: account.pairingCodeExpiresAt || null,
      account: summarize(account),
    }));
    return;
  }

  const data = await mobileRequest(session, "/api/mobile/whatsapp/accounts/qr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const account = data.account;
  if (!account?.id) throw new Error("WHATSAPP_ACCOUNT_RESPONSE_INVALID");
  if (account.status === "CONNECTED") {
    console.log(JSON.stringify({ ok: true, alreadyConnected: true, account: summarize(account) }));
    return;
  }
  if (!account.qrCode) throw new Error(`WHATSAPP_QR_NOT_READY_${account.status || "UNKNOWN"}`);
  await saveQrImage(account.qrCode);
  console.log(JSON.stringify({
    ok: true,
    alreadyConnected: false,
    qrPath: outputPath,
    account: summarize(account),
  }));
}

function summarize(account) {
  return {
    id: account?.id || null,
    status: account?.status || null,
    displayName: account?.displayName || null,
    phoneNumber: account?.phoneNumber || null,
    qrExpiresAt: account?.qrExpiresAt || null,
    pairingCodeExpiresAt: account?.pairingCodeExpiresAt || null,
    groupCount: account?.groupCount ?? 0,
    contactCount: account?.contactCount ?? 0,
    lastConnectedAt: account?.lastConnectedAt || null,
    lastError: account?.lastError || null,
  };
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "UNKNOWN_ERROR" }));
  process.exitCode = 1;
});
