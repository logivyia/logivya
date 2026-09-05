import process from "node:process";

import {
  AppleConfigurationError,
  AppStoreConnectError,
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";

const contactEmail = "logivya@gmail.com";

function write(configuration, pathname, method, body) {
  return appStoreConnectRequest(configuration, pathname, {}, { method, body });
}

function requiredPhone() {
  const value = process.env.TESTFLIGHT_REVIEW_CONTACT_PHONE?.trim() ?? "";
  if (!/^\+[1-9]\d{7,14}$/u.test(value)) {
    throw new AppleConfigurationError("TESTFLIGHT_REVIEW_CONTACT_PHONE must use E.164 format.");
  }
  return value;
}

async function resolveDemoAccount(configuration) {
  const versions = await appStoreConnectRequest(
    configuration,
    `/v1/apps/${configuration.appStoreAppId}/appStoreVersions`,
    { "filter[platform]": "IOS", limit: 50 },
  );
  const version = (versions.payload?.data ?? []).find(
    (entry) => entry.attributes?.appStoreState === "WAITING_FOR_REVIEW",
  ) ?? (versions.payload?.data ?? []).find(
    (entry) => entry.attributes?.versionString === "1.0",
  );
  if (!version?.id) throw new Error("The App Store review version could not be resolved.");

  const detail = await appStoreConnectRequest(
    configuration,
    `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`,
  );
  const demoAccountName = detail.payload?.data?.attributes?.demoAccountName?.trim();
  const demoAccountPassword = detail.payload?.data?.attributes?.demoAccountPassword;
  if (!demoAccountName || !demoAccountPassword) {
    throw new Error("The verified App Store demo account is not configured.");
  }
  return { demoAccountName, demoAccountPassword };
}

try {
  const configuration = loadAppleConfiguration();
  const phone = requiredPhone();
  const [users, builds, demoAccount] = await Promise.all([
    appStoreConnectRequest(configuration, "/v1/users", {
      "filter[username]": contactEmail,
      limit: 10,
    }),
    appStoreConnectRequest(configuration, "/v1/builds", {
      "filter[app]": configuration.appStoreAppId,
      limit: 100,
      sort: "-uploadedDate",
    }),
    resolveDemoAccount(configuration),
  ]);
  const accountHolder = (users.payload?.data ?? []).find((user) =>
    Array.isArray(user.attributes?.roles) && user.attributes.roles.includes("ACCOUNT_HOLDER"),
  );
  if (!accountHolder?.attributes?.firstName || !accountHolder.attributes?.lastName) {
    throw new Error("The App Store Connect Account Holder contact could not be resolved.");
  }
  const requestedBuild = process.env.IOS_BUILD_NUMBER?.trim();
  const candidates = (builds.payload?.data ?? [])
    .filter((item) => item.attributes?.processingState === "VALID")
    .sort((left, right) => Number(right.attributes?.version ?? 0) - Number(left.attributes?.version ?? 0));
  const build = requestedBuild
    ? candidates.find((item) => item.attributes?.version === requestedBuild)
    : candidates[0];
  if (!build) {
    throw new Error(requestedBuild
      ? `Valid TestFlight build ${requestedBuild} was not found.`
      : "No valid TestFlight build was found.");
  }

  await write(configuration, `/v1/betaAppReviewDetails/${configuration.appStoreAppId}`, "PATCH", {
    data: {
      type: "betaAppReviewDetails",
      id: configuration.appStoreAppId,
      attributes: {
        contactFirstName: accountHolder.attributes.firstName,
        contactLastName: accountHolder.attributes.lastName,
        contactPhone: phone,
        contactEmail,
        demoAccountRequired: true,
        demoAccountName: demoAccount.demoAccountName,
        demoAccountPassword: demoAccount.demoAccountPassword,
        notes: "Use the provided dedicated demo account; no invitation, one-time password, or payment is required. It has an active Professional entitlement and a connected WhatsApp test account. For safe message testing, select only the contact named \"Logivya App Review Self Test\"; it sends to the connected account's own self-chat. The beta demonstrates authentication, account connection, group/contact synchronization, messaging, scheduling, history, support, notifications, privacy controls, and session recovery.",
      },
    },
  });

  const detail = await appStoreConnectRequest(configuration, `/v1/builds/${build.id}/buildBetaDetail`);
  const externalState = detail.payload?.data?.attributes?.externalBuildState;
  if (externalState !== "READY_FOR_BETA_SUBMISSION") {
    throw new Error(`Build ${build.attributes?.version} cannot be submitted from external state ${externalState || "UNKNOWN"}.`);
  }

  const submission = await write(configuration, "/v1/betaAppReviewSubmissions", "POST", {
    data: {
      type: "betaAppReviewSubmissions",
      relationships: { build: { data: { type: "builds", id: build.id } } },
    },
  });
  const updatedDetail = await appStoreConnectRequest(configuration, `/v1/builds/${build.id}/buildBetaDetail`);

  console.log(JSON.stringify({
    ok: true,
    build: { id: build.id, number: build.attributes?.version },
    submission: {
      id: submission.payload?.data?.id ?? null,
      state: submission.payload?.data?.attributes?.betaReviewState ?? null,
    },
    externalBuildState: updatedDetail.payload?.data?.attributes?.externalBuildState ?? null,
    contact: {
      firstName: accountHolder.attributes.firstName,
      lastName: accountHolder.attributes.lastName,
      email: contactEmail,
      phoneStored: true,
    },
    publicLinkEnabled: false,
  }, null, 2));
} catch (error) {
  if (error instanceof AppleConfigurationError) {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exit(2);
  }
  if (error instanceof AppStoreConnectError) {
    console.error(JSON.stringify({ ok: false, httpStatus: error.status, errorCodes: error.codes }));
    process.exit(3);
  }
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Unexpected failure." }));
  process.exit(4);
}
