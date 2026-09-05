import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  EXPECTED_BUNDLE_ID,
  EXPECTED_TEAM_ID,
  loadAppleConfiguration,
  repoRoot,
} from "./app-store-connect-client.mjs";

const expectedProjectDirectory = path.join(repoRoot, "apps", "mobile");
const appleUtilsModule = process.env.EAS_APPLE_UTILS_MODULE?.trim();

if (!appleUtilsModule || !existsSync(appleUtilsModule)) {
  throw new Error("EAS_APPLE_UTILS_MODULE must point to the installed @expo/apple-utils package.");
}

const require = createRequire(import.meta.url);
const {
  BundleId,
  CapabilityType,
  CapabilityTypeOption,
  CertificateType,
  Profile,
  ProfileType,
  Token,
  createCertificateAndP12Async,
} = require(appleUtilsModule);

const configuration = loadAppleConfiguration();
if (configuration.bundleId !== EXPECTED_BUNDLE_ID || configuration.teamId !== EXPECTED_TEAM_ID) {
  throw new Error("Refusing to configure signing for an unexpected Apple target.");
}

const credentialsDirectory = path.join(expectedProjectDirectory, ".eas-credentials");
const certificatePath = path.join(credentialsDirectory, "logivya-ios-distribution.p12");
const profilePath = path.join(credentialsDirectory, "logivya-ios-app-store.mobileprovision");
const credentialsJsonPath = path.join(expectedProjectDirectory, "credentials.json");

if ([certificatePath, profilePath, credentialsJsonPath].some((candidate) => existsSync(candidate))) {
  throw new Error("Local iOS signing files already exist. Refusing to overwrite signing material.");
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

let pushCapability = await bundle.hasCapabilityAsync(CapabilityType.PUSH_NOTIFICATIONS);
if (!pushCapability) {
  await bundle.updateBundleIdCapabilityAsync({
    capabilityType: CapabilityType.PUSH_NOTIFICATIONS,
    option: CapabilityTypeOption.ON,
  });
  pushCapability = await bundle.hasCapabilityAsync(CapabilityType.PUSH_NOTIFICATIONS);
}
if (!pushCapability) throw new Error("Push Notifications capability could not be enabled for the iOS bundle.");

const signing = await createCertificateAndP12Async(context, {
  certificateType: CertificateType.IOS_DISTRIBUTION,
});

const profileName = `Logivya App Store ${new Date().toISOString().slice(0, 10)}`;
const profile = await Profile.createAsync(context, {
  bundleId: bundle.id,
  certificates: [signing.certificate.id],
  devices: [],
  name: profileName,
  profileType: ProfileType.IOS_APP_STORE,
});

if (!profile.attributes.profileContent) {
  throw new Error("Apple created a provisioning profile without downloadable content.");
}

mkdirSync(credentialsDirectory, { recursive: true });
writeFileSync(certificatePath, Buffer.from(signing.certificateP12, "base64"), { mode: 0o600 });
writeFileSync(profilePath, Buffer.from(profile.attributes.profileContent, "base64"), { mode: 0o600 });
writeFileSync(
  credentialsJsonPath,
  `${JSON.stringify(
    {
      ios: {
        provisioningProfilePath: path.relative(expectedProjectDirectory, profilePath).replaceAll("\\", "/"),
        distributionCertificate: {
          path: path.relative(expectedProjectDirectory, certificatePath).replaceAll("\\", "/"),
          password: signing.password,
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
      pushNotificationsCapability: true,
      certificate: {
        id: signing.certificate.id,
        serialNumber: signing.certificate.attributes.serialNumber,
        expirationDate: signing.certificate.attributes.expirationDate,
      },
      provisioningProfile: {
        id: profile.id,
        name: profile.attributes.name,
        type: profile.attributes.profileType,
        expirationDate: profile.attributes.expirationDate,
      },
      localSigningFilesCreated: true,
      sensitiveValuesPrinted: false,
    },
    null,
    2,
  ),
);
