import {
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";

const configuration = loadAppleConfiguration();
const bundleResponse = await appStoreConnectRequest(configuration, "/v1/bundleIds", {
  "filter[identifier]": configuration.bundleId,
  limit: 10,
});
const bundle = bundleResponse.payload?.data?.[0];
if (!bundle) throw new Error(`Apple Bundle ID ${configuration.bundleId} was not found.`);

async function safeRequest(pathname, searchParams) {
  try {
    const response = await appStoreConnectRequest(configuration, pathname, searchParams);
    return { ok: true, status: response.status, data: response.payload?.data || [] };
  } catch (error) {
    return { ok: false, status: error.status || 0, codes: error.codes || [] };
  }
}

const [capabilities, certificates, profiles] = await Promise.all([
  safeRequest("/v1/bundleIdCapabilities", {
    "filter[bundleId]": bundle.id,
    limit: 100,
  }),
  safeRequest("/v1/certificates", {
    "filter[certificateType]": "DISTRIBUTION,IOS_DISTRIBUTION",
    limit: 100,
  }),
  safeRequest("/v1/profiles", {
    "filter[profileType]": "IOS_APP_STORE",
    limit: 100,
  }),
]);

const logivyaProfiles = (profiles.data || []).filter((profile) =>
  String(profile.attributes?.name || "").startsWith("Logivya App Store"),
);

console.log(
  JSON.stringify(
    {
      bundleIdentifier: bundle.attributes?.identifier,
      bundleIdResourceId: bundle.id,
      endpointAccess: {
        capabilities: { ok: capabilities.ok, status: capabilities.status, codes: capabilities.codes || [] },
        certificates: { ok: certificates.ok, status: certificates.status, codes: certificates.codes || [] },
        profiles: { ok: profiles.ok, status: profiles.status, codes: profiles.codes || [] },
      },
      capabilities: (capabilities.data || []).map((item) => item.attributes?.capabilityType),
      distributionCertificates: (certificates.data || []).map((certificate) => ({
        id: certificate.id,
        type: certificate.attributes?.certificateType,
        serialNumber: certificate.attributes?.serialNumber,
        expirationDate: certificate.attributes?.expirationDate,
      })),
      logivyaProfiles: logivyaProfiles.map((profile) => ({
        id: profile.id,
        name: profile.attributes?.name,
        state: profile.attributes?.profileState,
        type: profile.attributes?.profileType,
        expirationDate: profile.attributes?.expirationDate,
      })),
    },
    null,
    2,
  ),
);
