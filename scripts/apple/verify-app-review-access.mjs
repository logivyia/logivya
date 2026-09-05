import {
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mobileConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), "apps/mobile/app.json"), "utf8"),
).expo;
const easConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), "apps/mobile/eas.json"), "utf8").replace(/^\uFEFF/u, ""),
);
const iosProfileEnvironment = {
  ...(easConfig.build?.production?.env || {}),
  ...(easConfig.build?.["ios-production"]?.env || {}),
};
let mobileVersion = iosProfileEnvironment.EXPO_PUBLIC_APP_VERSION || mobileConfig.version;
let iosBuildNumber = String(iosProfileEnvironment.IOS_BUILD_NUMBER || mobileConfig.ios.buildNumber);

const apiOrigin = new URL(
  process.env.APP_REVIEW_API_ORIGIN || "https://www.logivya.com",
).origin;

function safeResult(response, payload) {
  const matchedPath = response.headers.get("x-matched-path");
  return {
    httpStatus: response.status,
    success: response.ok && payload?.success === true,
    errorCode: payload?.error?.code || null,
    matchedPath,
    notDeployed: matchedPath === "/_not-found",
  };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function request(pathname, init = {}) {
  const response = await fetch(new URL(pathname, apiOrigin), {
    ...init,
    headers: {
      Accept: "application/json",
      "X-Client-Platform": "ios",
      "X-Logivya-App-Version": mobileVersion,
      "X-Logivya-Version-Code": iosBuildNumber,
      ...(init.headers || {}),
    },
  });
  return { response, payload: await readJson(response) };
}

async function verifyWebSession(credentials) {
  const loginResponse = await fetch(new URL("/api/auth/login", apiOrigin), {
    method: "POST",
    redirect: "manual",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: apiOrigin,
      Referer: `${apiOrigin}/login`,
      "User-Agent": `LogivyaReleaseSmoke/${mobileVersion}`,
    },
    body: JSON.stringify({
      identifier: credentials.identifier,
      password: credentials.password,
      deviceFingerprint: "app-review-web-release-smoke",
      deviceName: "App Review Web Release Smoke",
    }),
  });
  const loginPayload = await readJson(loginResponse);
  const cookieValues = typeof loginResponse.headers.getSetCookie === "function"
    ? loginResponse.headers.getSetCookie()
    : [loginResponse.headers.get("set-cookie")].filter(Boolean);
  const cookieHeader = cookieValues
    .map((value) => value.split(";", 1)[0])
    .join("; ");
  const loginSucceeded = loginResponse.status === 200
    && loginPayload?.ok === true
    && cookieHeader.length > 0;
  if (!loginSucceeded) {
    return {
      loginHttpStatus: loginResponse.status,
      loginSucceeded: false,
      sessionCookieCreated: cookieHeader.length > 0,
      dashboardHttpStatus: null,
      dashboardAccessible: false,
    };
  }

  const dashboardResponse = await fetch(new URL("/dashboard", apiOrigin), {
    redirect: "manual",
    headers: {
      Accept: "text/html",
      Cookie: cookieHeader,
      "User-Agent": `LogivyaReleaseSmoke/${mobileVersion}`,
    },
  });
  const contentType = dashboardResponse.headers.get("content-type") || "";
  const protectedWebPaths = {
    whatsappSend: "/send-message?platform=WHATSAPP",
    whatsappHistory: "/message-history?platform=WHATSAPP",
    telegramPage: "/telegram",
    telegramWorkspace: "/api/web/telegram/workspace",
  };
  const protectedWebResults = Object.fromEntries(await Promise.all(
    Object.entries(protectedWebPaths).map(async ([name, pathname]) => {
      const response = await fetch(new URL(pathname, apiOrigin), {
        redirect: "manual",
        headers: {
          Accept: pathname.startsWith("/api/") ? "application/json" : "text/html",
          Cookie: cookieHeader,
          "User-Agent": `LogivyaReleaseSmoke/${mobileVersion}`,
        },
      });
      return [name, {
        httpStatus: response.status,
        accessible: response.status === 200,
      }];
    }),
  ));
  return {
    loginHttpStatus: loginResponse.status,
    loginSucceeded: true,
    sessionCookieCreated: true,
    dashboardHttpStatus: dashboardResponse.status,
    dashboardAccessible: dashboardResponse.status === 200
      && contentType.includes("text/html"),
    protectedRoutes: protectedWebResults,
  };
}

async function resolveReviewCredentials(configuration) {
  const versions = await appStoreConnectRequest(
    configuration,
    `/v1/apps/${configuration.appStoreAppId}/appStoreVersions`,
    { "filter[platform]": "IOS", limit: 50 },
  );
  const version = versions.payload?.data?.find(
    (entry) => entry.attributes?.versionString === mobileVersion,
  ) || versions.payload?.data?.find(
    (entry) => entry.attributes?.appStoreState === "WAITING_FOR_REVIEW",
  ) || versions.payload?.data?.find(
    (entry) => entry.attributes?.versionString === "1.0",
  );
  if (!version?.id) throw new Error("APP_STORE_VERSION_NOT_FOUND");

  const detail = await appStoreConnectRequest(
    configuration,
    `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`,
  );
  const attributes = detail.payload?.data?.attributes;
  const identifier = attributes?.demoAccountName?.trim();
  const password = attributes?.demoAccountPassword;
  if (!identifier || !password) {
    throw new Error("APP_REVIEW_CREDENTIALS_NOT_CONFIGURED");
  }

  const selectedBuild = await appStoreConnectRequest(
    configuration,
    `/v1/appStoreVersions/${version.id}/build`,
  );
  const selectedBuildNumber = selectedBuild.payload?.data?.attributes?.version;

  return {
    identifier,
    password,
    versionId: version.id,
    marketingVersion: version.attributes?.versionString || mobileVersion,
    buildNumber: selectedBuildNumber || iosBuildNumber,
  };
}

async function main() {
  const configuration = loadAppleConfiguration();
  const credentials = await resolveReviewCredentials(configuration);
  mobileVersion = credentials.marketingVersion;
  iosBuildNumber = String(credentials.buildNumber);
  const web = await verifyWebSession(credentials);
  const login = await request("/api/mobile/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: credentials.identifier,
      password: credentials.password,
      deviceId: "app-review-readiness-verification",
      platform: "ios",
      appVersion: mobileVersion,
    }),
  });
  const loginResult = safeResult(login.response, login.payload);
  const loginData = login.payload?.data;
  const mfaRequired = loginData?.mfaRequired === true;
  const accessToken = loginData?.tokens?.accessToken;

  if (!loginResult.success || mfaRequired || !accessToken) {
    console.log(JSON.stringify({
      ok: false,
      appStoreVersionId: credentials.versionId,
      apiOrigin,
      login: loginResult,
      mfaRequired,
      sessionCreated: false,
    }));
    process.exitCode = 1;
    return;
  }

  const authHeaders = { Authorization: `Bearer ${accessToken}` };
  const paths = {
    appVersion: "/api/mobile/app-version",
    bootstrap: "/api/mobile/bootstrap",
    subscription: "/api/mobile/subscription/status",
    subscriptionRequests: "/api/mobile/subscription/requests",
    checkoutEligibility: "/api/mobile/subscription/checkout-eligibility",
    teamUsers: "/api/mobile/team/users",
    accounts: "/api/mobile/whatsapp/accounts",
    groups: "/api/mobile/groups?limit=1",
    contacts: "/api/mobile/whatsapp/contacts?limit=1",
    freightAccess: "/api/mobile/freight/access",
    telegramAccess: "/api/mobile/telegram/access",
  };
  const entries = await Promise.all(
    Object.entries(paths).map(async ([name, pathname]) => {
      const result = await request(pathname, { headers: authHeaders });
      return [name, {
        ...safeResult(result.response, result.payload),
        payload: result.payload,
      }];
    }),
  );
  const results = Object.fromEntries(entries);
  const bootstrap = results.bootstrap.payload?.data;
  const subscription = results.subscription.payload?.data;
  const accountPayload = results.accounts.payload?.data;
  const accounts = Array.isArray(accountPayload)
    ? accountPayload
    : accountPayload?.accounts || accountPayload?.items || [];
  const hasWhatsappAccount = Array.isArray(accounts) && accounts.length > 0;
  const checks = Object.fromEntries(
    Object.entries(results).map(([name, value]) => {
      const notApplicable = name === "contacts"
        && value.httpStatus === 409
        && value.errorCode === "WHATSAPP_ACCOUNT_REQUIRED";
      return [
        name,
        {
          httpStatus: value.httpStatus,
          success: value.success || notApplicable,
          notApplicable,
          errorCode: value.errorCode,
        },
      ];
    }),
  );
  const appVersionPolicy = results.appVersion.payload?.data;
  checks.appVersion = {
    ...checks.appVersion,
    success: checks.appVersion.success && appVersionPolicy?.forceUpdate !== true,
    expectedVersion: mobileVersion,
    currentVersion: appVersionPolicy?.currentVersion || null,
    forceUpdate: appVersionPolicy?.forceUpdate === true,
  };
  checks.freightAccess = {
    ...checks.freightAccess,
    success: checks.freightAccess.success && results.freightAccess.payload?.data?.enabled === true,
    enabled: results.freightAccess.payload?.data?.enabled === true,
    audience: results.freightAccess.payload?.data?.audience || null,
  };
  checks.telegramAccess = {
    ...checks.telegramAccess,
    success: checks.telegramAccess.success && results.telegramAccess.payload?.data?.enabled === true,
    enabled: results.telegramAccess.payload?.data?.enabled === true,
  };
  const allAccessible = Object.values(checks).every(
    (check) => check.success && (check.notApplicable || check.httpStatus === 200),
  ) && web.loginSucceeded
    && web.dashboardAccessible
    && Object.values(web.protectedRoutes || {}).every((route) => route.accessible);

  console.log(JSON.stringify({
    ok: allAccessible,
    appStoreVersionId: credentials.versionId,
    apiOrigin,
    iosRelease: { marketingVersion: mobileVersion, buildNumber: iosBuildNumber },
    login: loginResult,
    mfaRequired: false,
    sessionCreated: true,
    web,
    plan: bootstrap?.subscription?.planSlug
      || subscription?.subscription?.planSlug
      || null,
    subscriptionActive: bootstrap?.subscription?.isActive
      ?? subscription?.subscription?.isActive
      ?? null,
    contactMessaging: bootstrap?.subscription?.entitlements?.contactMessaging
      ?? subscription?.entitlements?.contactMessaging
      ?? null,
    messageSend: bootstrap?.subscription?.entitlements?.messageSend
      ?? subscription?.entitlements?.messageSend
      ?? null,
    checks,
  }));
  if (!allAccessible) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
  }));
  process.exitCode = 1;
});
