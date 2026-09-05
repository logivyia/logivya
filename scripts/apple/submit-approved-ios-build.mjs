import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { appStoreConnectRequest, loadAppleConfiguration, repoRoot } from "./app-store-connect-client.mjs";

const args = process.argv.slice(2);
const idIndex = args.indexOf("--id");
const pathIndex = args.indexOf("--path");
const buildId = idIndex >= 0 ? args[idIndex + 1] : null;
const ipaPath = pathIndex >= 0 ? args[pathIndex + 1] : null;
const appIdIndex = args.indexOf("--app-id");
const bundleIdIndex = args.indexOf("--bundle-id");
const confirmedAppId = appIdIndex >= 0 ? args[appIdIndex + 1] : null;
const confirmedBundleId = bundleIdIndex >= 0 ? args[bundleIdIndex + 1] : null;
const checkOnly = args.includes("--check-only");

if (!checkOnly && process.env.APPLE_SUBMISSION_APPROVED !== "YES") {
  console.error("Submission blocked: set APPLE_SUBMISSION_APPROVED=YES only after explicit human approval.");
  process.exit(2);
}
if ((!buildId && !ipaPath) || (buildId && ipaPath)) {
  console.error("Provide exactly one approved artifact with --id <EAS_BUILD_ID> or --path <IPA_PATH>.");
  process.exit(2);
}
if (buildId && !/^[A-Za-z0-9-]{8,}$/u.test(buildId)) {
  console.error("Submission blocked: the EAS build ID format is invalid.");
  process.exit(2);
}
const resolvedIpaPath = ipaPath ? path.resolve(ipaPath) : null;
if (resolvedIpaPath && (path.extname(resolvedIpaPath).toLowerCase() !== ".ipa" || !existsSync(resolvedIpaPath))) {
  console.error("Submission blocked: --path must reference an existing .ipa file.");
  process.exit(2);
}
if (process.platform === "win32" && resolvedIpaPath) {
  console.error("Submission blocked: on Windows, submit the approved EAS build ID instead of a local IPA path.");
  process.exit(2);
}
if (checkOnly && !buildId) {
  console.error("Submission check requires --id <EAS_BUILD_ID>.");
  process.exit(2);
}

const configuration = loadAppleConfiguration();
const appStoreConnectAppId = configuration.appStoreAppId;
if (!/^\d+$/u.test(appStoreConnectAppId || "")) {
  console.error("Submission blocked: APP_STORE_CONNECT_APP_ID must identify the existing App Store Connect app record.");
  process.exit(2);
}
if (confirmedAppId !== configuration.appStoreAppId || confirmedBundleId !== configuration.bundleId) {
  console.error(
    `Submission blocked: confirm the target with --app-id ${configuration.appStoreAppId} --bundle-id ${configuration.bundleId}.`,
  );
  process.exit(2);
}

let shouldSubmit = !checkOnly;
if (buildId) {
  const buildViewCommand =
    process.platform === "win32"
      ? {
          command: process.env.ComSpec || "cmd.exe",
          args: ["/d", "/s", "/c", `npx eas-cli build:view ${buildId} --json`],
        }
      : { command: "npx", args: ["eas-cli", "build:view", buildId, "--json"] };
  const buildView = spawnSync(buildViewCommand.command, buildViewCommand.args, {
    cwd: `${repoRoot}/apps/mobile`,
    encoding: "utf8",
    env: process.env,
  });
  if (buildView.status !== 0) {
    console.error("Submission blocked: EAS build metadata could not be verified.");
    process.exit(buildView.status ?? 3);
  }
  let easBuild;
  try {
    easBuild = JSON.parse(buildView.stdout);
  } catch {
    console.error("Submission blocked: EAS build metadata was not valid JSON.");
    process.exit(3);
  }
  const buildNumber = String(easBuild.appBuildVersion || "");
  if (easBuild.platform !== "IOS" || easBuild.status !== "FINISHED" || !/^\d+$/u.test(buildNumber)) {
    console.error("Submission blocked: EAS artifact is not a finished iOS build with a numeric build number.");
    process.exit(3);
  }
  const existingBuild = await appStoreConnectRequest(configuration, "/v1/builds", {
    "filter[app]": appStoreConnectAppId,
    "filter[version]": buildNumber,
    limit: 1,
  });
  if ((existingBuild.payload?.data || []).length > 0) {
    console.error(
      `Submission blocked: iOS build ${buildNumber} is already in App Store Connect. Re-uploading it would cause ITMS-90189.`,
    );
    shouldSubmit = false;
    process.exitCode = 2;
  } else if (checkOnly) {
    console.log(JSON.stringify({ ok: true, action: "IOS_SUBMISSION_CHECK", buildId, buildNumber }, null, 2));
    process.exitCode = 0;
  }
}
if (shouldSubmit) {
  console.log(
    JSON.stringify(
      {
        action: "EAS_IOS_TESTFLIGHT_UPLOAD",
        appStoreAppId: configuration.appStoreAppId,
        bundleIdentifier: configuration.bundleId,
        appleTeamId: configuration.teamId,
        environment: "production",
        profile: "ios-production",
        artifact: buildId ? { type: "EAS_BUILD_ID", id: buildId } : { type: "IPA_PATH", fileName: path.basename(resolvedIpaPath) },
      },
      null,
      2,
    ),
  );
  const submitArgs = ["eas-cli", "submit", "--platform", "ios", "--profile", "ios-production", "--non-interactive", "--wait"];
  if (buildId) submitArgs.push("--id", buildId);
  if (resolvedIpaPath) submitArgs.push("--path", resolvedIpaPath);

  const submitCommand =
    process.platform === "win32"
      ? {
          command: process.env.ComSpec || "cmd.exe",
          args: ["/d", "/s", "/c", `npx ${submitArgs.join(" ")}`],
        }
      : { command: "npx", args: submitArgs };
  const result = spawnSync(submitCommand.command, submitCommand.args, {
    cwd: `${repoRoot}/apps/mobile`,
    stdio: "inherit",
    env: {
      ...process.env,
      EXPO_ASC_API_KEY_PATH: configuration.keyPath,
      EXPO_ASC_KEY_ID: configuration.keyId,
      EXPO_ASC_ISSUER_ID: configuration.issuerId,
      APP_STORE_CONNECT_APP_ID: appStoreConnectAppId,
    },
  });
  process.exitCode = result.status ?? 1;
}
