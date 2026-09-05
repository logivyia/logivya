import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  EXPECTED_BUNDLE_ID,
  EXPECTED_TEAM_ID,
  loadAppleConfiguration,
  repoRoot,
} from "./app-store-connect-client.mjs";

const expectedProjectDirectory = path.join(repoRoot, "apps", "mobile");
const credentialsDirectory = path.join(expectedProjectDirectory, ".eas-credentials");
const certificatePath = path.join(credentialsDirectory, "logivya-ios-distribution.p12");
const profilePath = path.join(credentialsDirectory, "logivya-ios-app-store.mobileprovision");
const credentialsJsonPath = path.join(expectedProjectDirectory, "credentials.json");
const passwordFile = path.join(process.env.USERPROFILE || "", ".logivya", "apple", "signing-v136", "logivya-distribution-p12-password.txt");
const appleUtilsModule = process.env.EAS_APPLE_UTILS_MODULE?.trim();
const certificateId = process.env.IOS_DISTRIBUTION_CERTIFICATE_ID?.trim();
const recreateApproved = process.env.IOS_PROVISIONING_RECREATE_APPROVED === "YES";

if (!appleUtilsModule || !existsSync(appleUtilsModule)) {
  throw new Error("EAS_APPLE_UTILS_MODULE must point to the installed @expo/apple-utils package.");
}
if (!certificateId || !/^[A-Z0-9]{10}$/u.test(certificateId)) {
  throw new Error("IOS_DISTRIBUTION_CERTIFICATE_ID must identify the verified Apple certificate.");
}
for (const requiredPath of [certificatePath, passwordFile]) {
  if (!existsSync(requiredPath)) throw new Error(`Required local signing file is missing: ${path.basename(requiredPath)}`);
}
if ((existsSync(profilePath) || existsSync(credentialsJsonPath)) && !recreateApproved) {
  throw new Error(
    "Provisioning profile or credentials.json already exists. Set IOS_PROVISIONING_RECREATE_APPROVED=YES to back up and replace local files.",
  );
}

const require = createRequire(import.meta.url);
const { BundleId, Certificate, CertificateType, Profile, ProfileType, Token } = require(appleUtilsModule);
const configuration = loadAppleConfiguration();
if (configuration.bundleId !== EXPECTED_BUNDLE_ID || configuration.teamId !== EXPECTED_TEAM_ID) {
  throw new Error("Refusing to configure provisioning for an unexpected Apple target.");
}

const context = {
  token: new Token({
    key: readFileSync(configuration.keyPath, "utf8"),
    issuerId: configuration.issuerId,
    keyId: configuration.keyId,
    duration: 1_200,
  }),
};

const bundle = await BundleId.findAsync(context, { identifier: configuration.bundleId });
if (!bundle) throw new Error(`Apple Bundle ID ${configuration.bundleId} was not found.`);

const certificates = await Certificate.getAsync(context, {
  query: {
    filter: {
      certificateType: [CertificateType.DISTRIBUTION, CertificateType.IOS_DISTRIBUTION],
    },
  },
});
const certificate = certificates.find((item) => item.id === certificateId);
if (!certificate) throw new Error(`Verified Apple distribution certificate ${certificateId} was not found.`);

const now = new Date();
const dateStamp = now.toISOString().replaceAll(":", "-").replaceAll(".", "-");
const profileName = `Logivya App Store ${dateStamp}`;
const profile = await Profile.createAsync(context, {
  bundleId: bundle.id,
  certificates: [certificate.id],
  devices: [],
  name: profileName,
  profileType: ProfileType.IOS_APP_STORE,
});
if (!profile.attributes.profileContent) {
  throw new Error("Apple created a provisioning profile without downloadable content.");
}

if (recreateApproved && (existsSync(profilePath) || existsSync(credentialsJsonPath))) {
  const backupDirectory = path.join(credentialsDirectory, "backups", dateStamp);
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  if (existsSync(profilePath)) {
    copyFileSync(profilePath, path.join(backupDirectory, path.basename(profilePath)));
  }
  if (existsSync(credentialsJsonPath)) {
    copyFileSync(credentialsJsonPath, path.join(backupDirectory, path.basename(credentialsJsonPath)));
  }
}

writeFileSync(profilePath, Buffer.from(profile.attributes.profileContent, "base64"), { mode: 0o600 });
const certificatePassword = readFileSync(passwordFile, "utf8").trim();
if (certificatePassword.length < 40) throw new Error("The local certificate password is invalid.");
writeFileSync(
  credentialsJsonPath,
  `${JSON.stringify(
    {
      ios: {
        provisioningProfilePath: ".eas-credentials/logivya-ios-app-store.mobileprovision",
        distributionCertificate: {
          path: ".eas-credentials/logivya-ios-distribution.p12",
          password: certificatePassword,
        },
      },
    },
    null,
    2,
  )}\n`,
  { mode: 0o600 },
);

console.log(
  JSON.stringify(
    {
      bundleIdentifier: configuration.bundleId,
      teamId: configuration.teamId,
      certificate: {
        id: certificate.id,
        serialNumber: certificate.attributes.serialNumber,
        expirationDate: certificate.attributes.expirationDate,
      },
      provisioningProfile: {
        id: profile.id,
        name: profile.attributes.name,
        type: profile.attributes.profileType,
        expirationDate: profile.attributes.expirationDate,
      },
      localCredentialsConfigured: true,
      sensitiveValuesPrinted: false,
    },
    null,
    2,
  ),
);
