import {
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";

const apiOrigin = new URL(process.env.APP_REVIEW_API_ORIGIN || "https://www.logivya.com").origin;
const accountId = process.argv[2]?.trim();
const expectedPhone = process.argv[3]?.replace(/\D/g, "");

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

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
    "PENDING_DEVELOPER_RELEASE",
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
  const detail = await appStoreConnectRequest(
    configuration,
    `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`,
  );
  const identifier = detail.payload?.data?.attributes?.demoAccountName?.trim();
  const password = detail.payload?.data?.attributes?.demoAccountPassword;
  if (!identifier || !password) throw new Error("APP_REVIEW_CREDENTIALS_NOT_CONFIGURED");
  return { identifier, password };
}

async function login(credentials) {
  const response = await fetch(new URL("/api/auth/login", apiOrigin), {
    method: "POST",
    redirect: "manual",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "LogivyaAppReviewSelfTest/1.0",
    },
    body: JSON.stringify({
      identifier: credentials.identifier,
      password: credentials.password,
      deviceFingerprint: "app-review-whatsapp-self-test",
      deviceName: "App Review WhatsApp Self Test",
    }),
  });
  const payload = await readJson(response);
  const cookieValues = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  const cookie = cookieValues.map((value) => value.split(";", 1)[0]).join("; ");
  if (response.status !== 200 || payload?.ok !== true || !cookie) {
    throw new Error(payload?.error || `APP_REVIEW_WEB_LOGIN_HTTP_${response.status}`);
  }
  return cookie;
}

async function webRequest(cookie, pathname, init = {}) {
  const response = await fetch(new URL(pathname, apiOrigin), {
    ...init,
    headers: {
      Accept: "application/json",
      Cookie: cookie,
      Origin: apiOrigin,
      Referer: `${apiOrigin}/messages`,
      "User-Agent": "LogivyaAppReviewSelfTest/1.0",
      ...(init.headers || {}),
    },
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.code || payload?.error || `WEB_API_HTTP_${response.status}`);
  return payload;
}

async function waitForDelivery(cookie, campaignId) {
  const deadline = Date.now() + 90_000;
  let latest = null;
  while (Date.now() < deadline) {
    const payload = await webRequest(
      cookie,
      `/api/messages/campaigns/${encodeURIComponent(campaignId)}/recipients`,
    );
    latest = payload?.recipients?.[0] || null;
    if (["SENT", "DELIVERED"].includes(latest?.status)) return latest;
    if (["FAILED", "CANCELED", "SKIPPED"].includes(latest?.status)) {
      throw new Error(`SELF_TEST_DELIVERY_${latest.status}${latest.errorMessage ? `_${latest.errorMessage}` : ""}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(`SELF_TEST_DELIVERY_TIMEOUT_${latest?.status || "UNKNOWN"}`);
}

async function main() {
  if (!accountId || !expectedPhone) throw new Error("ACCOUNT_ID_AND_PHONE_REQUIRED");
  const configuration = loadAppleConfiguration();
  const credentials = await resolveReviewCredentials(configuration);
  const cookie = await login(credentials);
  const query = new URLSearchParams({ accountId, search: expectedPhone, limit: "10" });
  const contactsPayload = await webRequest(cookie, `/api/whatsapp/contacts?${query}`);
  if (contactsPayload?.account?.id !== accountId) throw new Error("APP_REVIEW_ACCOUNT_MISMATCH");
  if (digits(contactsPayload.account.phoneNumber) !== expectedPhone) {
    throw new Error("APP_REVIEW_PHONE_MISMATCH");
  }
  const selfContact = contactsPayload.contacts?.find(
    (contact) => digits(contact.phone) === expectedPhone,
  );
  if (!selfContact?.id) throw new Error("APP_REVIEW_SELF_CONTACT_NOT_FOUND");

  const created = await webRequest(cookie, "/api/messages/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Apple Review WhatsApp Test",
      content: "Logivya App Review test: WhatsApp connection and message delivery are working.",
      groupIds: [],
      categoryIds: [],
      contactIds: [selfContact.id],
      targets: [],
      scheduleType: "SEND_NOW",
    }),
  });
  const campaignId = created?.campaign?.id;
  if (!campaignId) throw new Error("SELF_TEST_CAMPAIGN_RESPONSE_INVALID");
  const recipient = await waitForDelivery(cookie, campaignId);
  console.log(JSON.stringify({
    ok: true,
    campaignId,
    status: recipient.status,
    externalMessageIdStored: Boolean(recipient.externalMessageId),
    recipientPhone: `${expectedPhone.slice(0, 4)}****${expectedPhone.slice(-2)}`,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
  }));
  process.exitCode = 1;
});
