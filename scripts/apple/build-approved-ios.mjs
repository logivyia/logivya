import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  EXPECTED_APP_STORE_APP_ID,
  EXPECTED_BUNDLE_ID,
  loadAppleConfiguration,
  repoRoot,
} from "./app-store-connect-client.mjs";

const args = process.argv.slice(2);
const confirmedAppId = readArgument(args, "--app-id");
const confirmedBundleId = readArgument(args, "--bundle-id");

if (process.env.APPLE_BUILD_APPROVED !== "YES") {
  console.error("Build blocked: set APPLE_BUILD_APPROVED=YES only after explicit human approval.");
  process.exit(2);
}
if (confirmedAppId !== EXPECTED_APP_STORE_APP_ID || confirmedBundleId !== EXPECTED_BUNDLE_ID) {
  console.error(
    `Build blocked: confirm the target with --app-id ${EXPECTED_APP_STORE_APP_ID} --bundle-id ${EXPECTED_BUNDLE_ID}.`,
  );
  process.exit(2);
}

const configuration = loadAppleConfiguration();
console.log(
  JSON.stringify(
    {
      action: "EAS_IOS_PRODUCTION_BUILD",
      appStoreAppId: configuration.appStoreAppId,
      bundleIdentifier: configuration.bundleId,
      appleTeamId: configuration.teamId,
      environment: "production",
      profile: "ios-production",
    },
    null,
    2,
  ),
);

const easBuildCommand =
  process.platform === "win32"
    ? {
        command: process.env.ComSpec || "cmd.exe",
        args: [
          "/d",
          "/s",
          "/c",
          "npx eas-cli build --platform ios --profile ios-production --non-interactive --wait",
        ],
      }
    : {
        command: "npx",
        args: ["eas-cli", "build", "--platform", "ios", "--profile", "ios-production", "--non-interactive", "--wait"],
      };
const preflight = spawnSync(process.execPath, [`${repoRoot}/scripts/apple/ios-preflight.mjs`, "--new-build", ...(args.includes("--draft-while-in-review") ? ["--draft-while-in-review"] : [])], {
  cwd: `${repoRoot}/apps/mobile`,
  stdio: "inherit",
  env: process.env,
});
if (preflight.status !== 0) {
  console.error("Build blocked: iOS preflight did not pass.");
  process.exit(preflight.status ?? 3);
}

const result = spawnSync(easBuildCommand.command, easBuildCommand.args, {
  cwd: `${repoRoot}/apps/mobile`,
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);

function readArgument(values, name) {
  const index = values.indexOf(name);
  return index >= 0 ? values[index + 1] : null;
}
