import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  appStoreConnectRequest,
  loadAppleConfiguration,
  repoRoot,
} from "./app-store-connect-client.mjs";

const metadata = JSON.parse(
  readFileSync(
    path.join(repoRoot, "packages", "docs", "production-release", "apple", "app-store-metadata.json"),
    "utf8",
  ),
);
const eas = JSON.parse(
  readFileSync(path.join(repoRoot, "apps", "mobile", "eas.json"), "utf8").replace(/^\uFEFF/u, ""),
);
const version = String(metadata.version || "").trim();
const profileVersion = String(eas.build?.["ios-production"]?.env?.EXPO_PUBLIC_APP_VERSION || "").trim();

if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error("Apple metadata version is invalid.");
if (version !== profileVersion) throw new Error("Apple metadata and iOS build profile versions do not match.");

const configuration = loadAppleConfiguration();
const findVersion = async () => {
  const response = await appStoreConnectRequest(
    configuration,
    `/v1/apps/${configuration.appStoreAppId}/appStoreVersions`,
    { "filter[platform]": "IOS", "filter[versionString]": version, limit: 10 },
  );
  return (response.payload?.data || []).find(
    (entry) => entry.attributes?.platform === "IOS" && entry.attributes?.versionString === version,
  );
};

let appStoreVersion = await findVersion();
let created = false;
if (!appStoreVersion) {
  if (process.env.APPLE_STORE_RECORD_APPROVED !== "YES") {
    throw new Error("Set APPLE_STORE_RECORD_APPROVED=YES to create the App Store version draft.");
  }
  const response = await appStoreConnectRequest(configuration, "/v1/appStoreVersions", {}, {
    method: "POST",
    body: {
      data: {
        type: "appStoreVersions",
        attributes: {
          platform: "IOS",
          versionString: version,
          releaseType: "AFTER_APPROVAL",
          copyright: `${new Date().getFullYear()} Logivya`,
        },
        relationships: {
          app: { data: { type: "apps", id: configuration.appStoreAppId } },
        },
      },
    },
  });
  appStoreVersion = response.payload?.data || await findVersion();
  created = true;
}

if (!appStoreVersion?.id) throw new Error("App Store version draft could not be verified.");
console.log(JSON.stringify({
  ok: true,
  created,
  id: appStoreVersion.id,
  version: appStoreVersion.attributes?.versionString,
  platform: appStoreVersion.attributes?.platform,
  state: appStoreVersion.attributes?.appStoreState,
  releaseType: appStoreVersion.attributes?.releaseType,
}, null, 2));
