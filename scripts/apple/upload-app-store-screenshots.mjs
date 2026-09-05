import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  appStoreConnectRequest,
  loadAppleConfiguration,
  repoRoot,
} from "./app-store-connect-client.mjs";

const VERSION = process.env.APP_STORE_SCREENSHOT_VERSION?.trim() || "1.0";
const LOCALE = process.env.APP_STORE_SCREENSHOT_LOCALE?.trim() || "en-US";
const SOURCE_LOCALE = process.env.APP_STORE_SCREENSHOT_SOURCE_LOCALE?.trim() || LOCALE;
const PHONE_DIRECTORY = process.env.APP_STORE_SCREENSHOT_PHONE_DIRECTORY?.trim() || "iphone-6.9";
const PHONE_DISPLAY_TYPE = process.env.APP_STORE_SCREENSHOT_PHONE_DISPLAY_TYPE?.trim() || "APP_IPHONE_67";
const screenshotRoot = path.join(repoRoot, "artifacts", "app-store", "screenshots", SOURCE_LOCALE);
const targets = [
  { directory: PHONE_DIRECTORY, displayType: PHONE_DISPLAY_TYPE },
  { directory: "ipad-13", displayType: "APP_IPAD_PRO_3GEN_129" },
];

function dataArray(result) {
  return Array.isArray(result?.payload?.data) ? result.payload.data : [];
}

async function findVersion(configuration) {
  const response = await appStoreConnectRequest(configuration, `/v1/apps/${configuration.appStoreAppId}/appStoreVersions`, {
    "filter[platform]": "IOS",
    "filter[versionString]": VERSION,
    limit: 20,
  });
  const version = dataArray(response)[0];
  if (!version) throw new Error(`App Store version ${VERSION} was not found.`);
  return version;
}

async function findLocalization(configuration, versionId) {
  const response = await appStoreConnectRequest(
    configuration,
    `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`,
    { "filter[locale]": LOCALE, limit: 20 },
  );
  const localization = dataArray(response)[0];
  if (!localization) throw new Error(`Localization ${LOCALE} was not found.`);
  return localization;
}

async function listSets(configuration, localizationId) {
  const response = await appStoreConnectRequest(
    configuration,
    `/v1/appStoreVersionLocalizations/${localizationId}/appScreenshotSets`,
    { limit: 50 },
  );
  return dataArray(response);
}

async function createSet(configuration, localizationId, displayType) {
  const response = await appStoreConnectRequest(configuration, "/v1/appScreenshotSets", {}, {
    method: "POST",
    body: {
      data: {
        type: "appScreenshotSets",
        attributes: { screenshotDisplayType: displayType },
        relationships: {
          appStoreVersionLocalization: {
            data: { type: "appStoreVersionLocalizations", id: localizationId },
          },
        },
      },
    },
  });
  if (!response.payload?.data?.id) throw new Error(`Could not create screenshot set ${displayType}.`);
  return response.payload.data;
}

async function listScreenshots(configuration, setId) {
  const response = await appStoreConnectRequest(
    configuration,
    `/v1/appScreenshotSets/${setId}/appScreenshots`,
    { limit: 50 },
  );
  return dataArray(response);
}

async function ensureEmptySet(configuration, localizationId, displayType, existingSet) {
  if (!existingSet) return createSet(configuration, localizationId, displayType);
  const screenshots = await listScreenshots(configuration, existingSet.id);
  if (screenshots.length === 0) return existingSet;

  for (const screenshot of screenshots) {
    await appStoreConnectRequest(configuration, `/v1/appScreenshots/${screenshot.id}`, {}, {
      method: "DELETE",
    });
  }
  return existingSet;
}

async function reserveScreenshot(configuration, setId, filePath) {
  const file = await stat(filePath);
  const response = await appStoreConnectRequest(configuration, "/v1/appScreenshots", {}, {
    method: "POST",
    body: {
      data: {
        type: "appScreenshots",
        attributes: {
          fileName: path.basename(filePath),
          fileSize: file.size,
        },
        relationships: {
          appScreenshotSet: {
            data: { type: "appScreenshotSets", id: setId },
          },
        },
      },
    },
  });
  if (!response.payload?.data?.id) throw new Error(`Could not reserve ${path.basename(filePath)}.`);
  return response.payload.data;
}

async function uploadParts(fileBuffer, operations) {
  for (const operation of operations) {
    const offset = Number(operation.offset);
    const length = Number(operation.length);
    const body = fileBuffer.subarray(offset, offset + length);
    const headers = Object.fromEntries(
      (operation.requestHeaders || []).map((header) => [header.name, header.value]),
    );
    const response = await fetch(operation.url, {
      method: operation.method,
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`Screenshot upload operation failed with HTTP ${response.status}.`);
    }
  }
}

async function commitScreenshot(configuration, reservation, fileBuffer) {
  const checksum = createHash("md5").update(fileBuffer).digest("hex");
  await appStoreConnectRequest(configuration, `/v1/appScreenshots/${reservation.id}`, {}, {
    method: "PATCH",
    body: {
      data: {
        type: "appScreenshots",
        id: reservation.id,
        attributes: {
          uploaded: true,
          sourceFileChecksum: checksum,
        },
      },
    },
  });
}

async function waitForProcessing(configuration, screenshotId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await appStoreConnectRequest(
      configuration,
      `/v1/appScreenshots/${screenshotId}`,
      { "fields[appScreenshots]": "fileName,assetDeliveryState" },
    );
    const state = response.payload?.data?.attributes?.assetDeliveryState?.state;
    if (state === "COMPLETE") return;
    if (state === "FAILED") throw new Error(`Apple failed to process screenshot ${screenshotId}.`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Apple did not finish processing screenshot ${screenshotId} in time.`);
}

async function uploadFile(configuration, setId, filePath) {
  const fileBuffer = await readFile(filePath);
  const reservation = await reserveScreenshot(configuration, setId, filePath);
  const operations = reservation.attributes?.uploadOperations || [];
  if (operations.length === 0) throw new Error(`No upload operations returned for ${filePath}.`);
  await uploadParts(fileBuffer, operations);
  await commitScreenshot(configuration, reservation, fileBuffer);
  await waitForProcessing(configuration, reservation.id);
  return reservation.id;
}

async function screenshotFiles(directory) {
  const files = (await readdir(directory))
    .filter((file) => file.toLowerCase().endsWith(".png"))
    .sort((left, right) => left.localeCompare(right));
  if (files.length < 1 || files.length > 10) {
    throw new Error(`${directory} must contain between 1 and 10 PNG screenshots.`);
  }
  return files.map((file) => path.join(directory, file));
}

async function main() {
  const configuration = loadAppleConfiguration();
  const version = await findVersion(configuration);
  const localization = await findLocalization(configuration, version.id);
  const existingSets = await listSets(configuration, localization.id);
  const uploaded = [];

  for (const target of targets) {
    const directory = path.join(screenshotRoot, target.directory);
    const files = await screenshotFiles(directory);
    const existingSet = existingSets.find(
      (set) => set.attributes?.screenshotDisplayType === target.displayType,
    );
    const set = await ensureEmptySet(
      configuration,
      localization.id,
      target.displayType,
      existingSet,
    );

    for (const filePath of files) {
      const screenshotId = await uploadFile(configuration, set.id, filePath);
      uploaded.push({
        displayType: target.displayType,
        fileName: path.basename(filePath),
        screenshotId,
      });
      console.log(`Uploaded ${target.displayType}: ${path.basename(filePath)}`);
    }
  }

  console.log(JSON.stringify({
    versionId: version.id,
    localizationId: localization.id,
    uploaded,
  }, null, 2));
}

main().catch((error) => {
  if (error instanceof Error) {
    const status = "status" in error ? ` HTTP ${error.status}` : "";
    const codes = "codes" in error && Array.isArray(error.codes) ? ` [${error.codes.join(", ")}]` : "";
    console.error(`${error.message}${status}${codes}`);
  } else {
    console.error(String(error));
  }
  process.exitCode = 1;
});
