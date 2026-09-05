import process from "node:process";

import {
  AppleConfigurationError,
  AppStoreConnectError,
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";

const externalGroupName = "Logivya External Beta";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : "";
}

function normalizeEmail(value) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new Error("A valid --email address is required.");
  }
  return email;
}

function maskEmail(email) {
  const [localPart, domain] = email.split("@");
  return `${localPart.slice(0, 2)}***@${domain}`;
}

function write(configuration, pathname, method, body) {
  return appStoreConnectRequest(configuration, pathname, {}, { method, body });
}

async function findExternalGroup(configuration) {
  const response = await appStoreConnectRequest(configuration, "/v1/betaGroups", {
    "filter[app]": configuration.appStoreAppId,
    limit: 100,
  });
  const group = (response.payload?.data ?? []).find(
    (item) => item.attributes?.name === externalGroupName && !item.attributes?.isInternalGroup,
  );
  if (!group) throw new Error(`External TestFlight group not found: ${externalGroupName}`);
  return group;
}

async function findTester(configuration, email, includeAppFilter = true) {
  const filters = {
    "filter[email]": email,
    limit: 100,
  };
  if (includeAppFilter) filters["filter[apps]"] = configuration.appStoreAppId;
  const response = await appStoreConnectRequest(configuration, "/v1/betaTesters", filters);
  return (response.payload?.data ?? []).find(
    (item) => item.attributes?.email?.trim().toLowerCase() === email,
  ) ?? null;
}

async function ensureTester(configuration, email, groupId) {
  let tester = await findTester(configuration, email);
  if (tester) return { tester, created: false };

  try {
    const response = await write(configuration, "/v1/betaTesters", "POST", {
      data: {
        type: "betaTesters",
        attributes: { email },
        relationships: {
          betaGroups: { data: [{ type: "betaGroups", id: groupId }] },
        },
      },
    });
    tester = response.payload?.data;
    if (!tester?.id) throw new Error("Apple did not return the created beta tester.");
    return { tester, created: true };
  } catch (error) {
    if (!(error instanceof AppStoreConnectError) || error.status !== 409) throw error;
    tester = await findTester(configuration, email, false);
    if (!tester) throw error;
    return { tester, created: false };
  }
}

async function ensureGroupMembership(configuration, testerId, groupId) {
  const response = await appStoreConnectRequest(
    configuration,
    `/v1/betaTesters/${testerId}/relationships/betaGroups`,
    { limit: 100 },
  );
  const alreadyLinked = (response.payload?.data ?? []).some((item) => item.id === groupId);
  if (alreadyLinked) return false;

  await write(
    configuration,
    `/v1/betaTesters/${testerId}/relationships/betaGroups`,
    "POST",
    { data: [{ type: "betaGroups", id: groupId }] },
  );
  return true;
}

async function sendInvitation(configuration, testerId) {
  const response = await write(configuration, "/v1/betaTesterInvitations", "POST", {
    data: {
      type: "betaTesterInvitations",
      relationships: {
        app: { data: { type: "apps", id: configuration.appStoreAppId } },
        betaTester: { data: { type: "betaTesters", id: testerId } },
      },
    },
  });
  return response.payload?.data?.id ?? null;
}

async function verify(configuration, testerId, groupId) {
  const [tester, groups, builds] = await Promise.all([
    appStoreConnectRequest(configuration, `/v1/betaTesters/${testerId}`),
    appStoreConnectRequest(configuration, `/v1/betaTesters/${testerId}/relationships/betaGroups`, {
      limit: 100,
    }),
    appStoreConnectRequest(configuration, `/v1/betaGroups/${groupId}/builds`, { limit: 100 }),
  ]);
  const groupLinked = (groups.payload?.data ?? []).some((item) => item.id === groupId);
  if (!groupLinked) throw new Error("Tester group membership could not be verified.");
  return {
    state: tester.payload?.data?.attributes?.state ?? null,
    inviteType: tester.payload?.data?.attributes?.inviteType ?? null,
    groupLinked,
    buildNumbers: (builds.payload?.data ?? []).map((item) => item.attributes?.version).filter(Boolean),
  };
}

try {
  const email = normalizeEmail(argument("--email"));
  const configuration = loadAppleConfiguration();
  const group = await findExternalGroup(configuration);
  const { tester, created } = await ensureTester(configuration, email, group.id);
  const groupLinkedNow = await ensureGroupMembership(configuration, tester.id, group.id);
  const invitationId = await sendInvitation(configuration, tester.id);
  const verification = await verify(configuration, tester.id, group.id);

  console.log(JSON.stringify({
    ok: true,
    appStoreAppId: configuration.appStoreAppId,
    tester: {
      id: tester.id,
      email: maskEmail(email),
      created,
      groupLinkedNow,
      state: verification.state,
      inviteType: verification.inviteType,
    },
    externalGroup: {
      id: group.id,
      name: externalGroupName,
      buildNumbers: verification.buildNumbers,
    },
    invitation: {
      sent: Boolean(invitationId),
      id: invitationId,
    },
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
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : "Unexpected TestFlight invitation failure.",
  }));
  process.exit(4);
}
