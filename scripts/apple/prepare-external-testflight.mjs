import process from "node:process";

import {
  AppleConfigurationError,
  AppStoreConnectError,
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";

const groupName = "Logivya External Beta";
const feedbackEmail = "logivya@gmail.com";

function write(configuration, pathname, method, body) {
  return appStoreConnectRequest(configuration, pathname, {}, { method, body });
}

async function findBuild(configuration) {
  const result = await appStoreConnectRequest(configuration, "/v1/builds", {
    "filter[app]": configuration.appStoreAppId,
    limit: 100,
    sort: "-uploadedDate",
  });
  const requestedBuild = process.env.IOS_BUILD_NUMBER?.trim();
  const candidates = (result.payload?.data ?? [])
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
  return build;
}

async function ensureExternalGroup(configuration) {
  const existing = await appStoreConnectRequest(configuration, "/v1/betaGroups", {
    "filter[app]": configuration.appStoreAppId,
    limit: 100,
  });
  const found = (existing.payload?.data ?? []).find(
    (group) => group.attributes?.name === groupName && !group.attributes?.isInternalGroup,
  );
  if (found) return { group: found, created: false };

  const created = await write(configuration, "/v1/betaGroups", "POST", {
    data: {
      type: "betaGroups",
      attributes: {
        name: groupName,
        isInternalGroup: false,
        publicLinkEnabled: false,
        feedbackEnabled: true,
      },
      relationships: {
        app: { data: { type: "apps", id: configuration.appStoreAppId } },
      },
    },
  });
  return { group: created.payload?.data, created: true };
}

async function ensureBuildInGroup(configuration, groupId, buildId) {
  const related = await appStoreConnectRequest(configuration, `/v1/betaGroups/${groupId}/builds`, { limit: 100 });
  if ((related.payload?.data ?? []).some((build) => build.id === buildId)) return false;
  await write(configuration, `/v1/betaGroups/${groupId}/relationships/builds`, "POST", {
    data: [{ type: "builds", id: buildId }],
  });
  return true;
}

async function ensureAppLocalization(configuration) {
  const result = await appStoreConnectRequest(
    configuration,
    `/v1/apps/${configuration.appStoreAppId}/betaAppLocalizations`,
    { limit: 100 },
  );
  const found = (result.payload?.data ?? []).find((item) => item.attributes?.locale === "en-US");
  const attributes = {
    description: "Test Logivya account access, WhatsApp connection, group and contact synchronization, messaging, scheduling, support, notifications, privacy controls, and session recovery.",
    feedbackEmail,
    marketingUrl: "https://www.logivya.com",
    privacyPolicyUrl: "https://www.logivya.com/privacy-policy",
  };
  if (found) {
    await write(configuration, `/v1/betaAppLocalizations/${found.id}`, "PATCH", {
      data: { type: "betaAppLocalizations", id: found.id, attributes },
    });
    return { id: found.id, created: false };
  }
  const created = await write(configuration, "/v1/betaAppLocalizations", "POST", {
    data: {
      type: "betaAppLocalizations",
      attributes: { locale: "en-US", ...attributes },
      relationships: { app: { data: { type: "apps", id: configuration.appStoreAppId } } },
    },
  });
  return { id: created.payload?.data?.id, created: true };
}

async function ensureBuildLocalization(configuration, buildId) {
  const result = await appStoreConnectRequest(configuration, `/v1/builds/${buildId}/betaBuildLocalizations`, {
    limit: 100,
  });
  const found = (result.payload?.data ?? []).find((item) => item.attributes?.locale === "en-US");
  const attributes = {
    whatsNew: "Initial iOS beta. Verify sign-up and login, WhatsApp QR and phone-code pairing, group/contact messaging, scheduling, message history, Delete for Everyone, support, notifications, and session persistence.",
  };
  if (found) {
    await write(configuration, `/v1/betaBuildLocalizations/${found.id}`, "PATCH", {
      data: { type: "betaBuildLocalizations", id: found.id, attributes },
    });
    return { id: found.id, created: false };
  }
  const created = await write(configuration, "/v1/betaBuildLocalizations", "POST", {
    data: {
      type: "betaBuildLocalizations",
      attributes: { locale: "en-US", ...attributes },
      relationships: { build: { data: { type: "builds", id: buildId } } },
    },
  });
  return { id: created.payload?.data?.id, created: true };
}

try {
  const configuration = loadAppleConfiguration();
  const build = await findBuild(configuration);
  const { group, created: groupCreated } = await ensureExternalGroup(configuration);
  if (!group?.id) throw new Error("Apple did not return an external TestFlight group.");
  const buildLinked = await ensureBuildInGroup(configuration, group.id, build.id);
  const appLocalization = await ensureAppLocalization(configuration);
  const buildLocalization = await ensureBuildLocalization(configuration, build.id);

  console.log(JSON.stringify({
    ok: true,
    build: { id: build.id, number: build.attributes?.version },
    externalGroup: { id: group.id, name: groupName, created: groupCreated, publicLinkEnabled: false },
    buildLinked,
    appLocalization,
    buildLocalization,
    nextGate: "BETA_REVIEW_CONTACT_REQUIRED",
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
