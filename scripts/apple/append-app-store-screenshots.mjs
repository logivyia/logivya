import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  appStoreConnectRequest,
  loadAppleConfiguration,
  repoRoot,
} from "./app-store-connect-client.mjs";

const VERSION = process.env.APP_STORE_SCREENSHOT_VERSION?.trim() || "1.0";
const LOCALE = process.env.APP_STORE_SCREENSHOT_LOCALE?.trim() || "en-US";
const screenshotRoot = path.join(
  repoRoot,
  "artifacts",
  "app-store",
  "screenshots",
  process.env.APP_STORE_SCREENSHOT_SOURCE_LOCALE?.trim() || "tr-TR",
);
const targets = [
  { directory: "iphone-6.5", displayType: "APP_IPHONE_65" },
  { directory: "ipad-13", displayType: "APP_IPAD_PRO_3GEN_129" },
];
const expectedExistingFileNames = ["01.png", "02.png", "03.png", "04.png", "05.png"];
const appendFileNames = ["06.png", "07.png", "08.png", "09.png"];

function dataArray(result) {
  return Array.isArray(result?.payload?.data) ? result.payload.data : [];
}

async function findVersion(configuration) {
  const response = await appStoreConnectRequest(
    configuration,
    `/v1/apps/${configuration.appStoreAppId}/appStoreVersions`,
    {
      "filter[platform]": "IOS",
      "filter[versionString]": VERSION,
      limit: 20,
    },
  );
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

async function listScreenshots(configuration, setId) {
  const response = await appStoreConnectRequest(
    configuration,
    `/v1/appScreenshotSets/${setId}/appScreenshots`,
    { limit: 50 },
  );
  return dataArray(response);
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
    const headers = Object.fromEntries(
      (operation.requestHeaders || []).map((header) => [header.name, header.value]),
    );
    const response = await fetch(operation.url, {
      method: operation.method,
      headers,
      body: fileBuffer.subarray(offset, offset + length),
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Screenshot upload failed with HTTP ${response.status}.`);
  }
}

async function uploadScreenshot(configuration, setId, filePath) {
  const fileBuffer = await readFile(filePath);
  const reservation = await reserveScreenshot(configuration, setId, filePath);
  const operations = reservation.attributes?.uploadOperations || [];
  if (operations.length === 0) throw new Error(`No upload operations returned for ${filePath}.`);
  await uploadParts(fileBuffer, operations);
  await appStoreConnectRequest(configuration, `/v1/appScreenshots/${reservation.id}`, {}, {
    method: "PATCH",
    body: {
      data: {
        type: "appScreenshots",
        id: reservation.id,
        attributes: {
          uploaded: true,
          sourceFileChecksum: createHash("md5").update(fileBuffer).digest("hex"),
        },
      },
    },
  });
  return reservation.id;
}

async function waitForProcessing(configuration, screenshotId) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
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

async function deleteScreenshots(configuration, screenshotIds) {
  for (const screenshotId of screenshotIds) {
    await appStoreConnectRequest(configuration, `/v1/appScreenshots/${screenshotId}`, {}, {
      method: "DELETE",
    });
  }
}

function names(screenshots) {
  return screenshots.map((item) => String(item.attributes?.fileName || "")).sort();
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

async function appendFiles(directory) {
  const files = appendFileNames.map((fileName) => path.join(directory, fileName));
  for (const filePath of files) {
    const file = await stat(filePath);
    if (!file.isFile() || file.size < 1) throw new Error(`Missing screenshot: ${filePath}`);
  }
  return files;
}

export async function appendAppStoreScreenshots(options = {}) {
  const configuration = options.configuration || loadAppleConfiguration();
  const log = options.log || console.log;
  const version = await findVersion(configuration);
  const localization = await findLocalization(configuration, version.id);
  const sets = await listSets(configuration, localization.id);
  const result = [];

  for (const target of targets) {
    const set = sets.find((item) => item.attributes?.screenshotDisplayType === target.displayType);
    if (!set) throw new Error(`Screenshot set ${target.displayType} was not found.`);

    const existingScreenshots = await listScreenshots(configuration, set.id);
    if (
      existingScreenshots.length !== expectedExistingFileNames.length
      || !sameValues(names(existingScreenshots), expectedExistingFileNames)
    ) {
      throw new Error(
        `${target.displayType} changed since verification: ${names(existingScreenshots).join(", ")}`,
      );
    }

    const existingIds = existingScreenshots.map((item) => item.id);
    const files = await appendFiles(path.join(screenshotRoot, target.directory));
    const newScreenshotIds = [];
    try {
      for (const filePath of files) {
        const screenshotId = await uploadScreenshot(configuration, set.id, filePath);
        await waitForProcessing(configuration, screenshotId);
        newScreenshotIds.push(screenshotId);
        log(`Verified ${target.displayType}: ${path.basename(filePath)}`);
      }
    } catch (error) {
      await deleteScreenshots(configuration, newScreenshotIds);
      throw error;
    }

    const finalScreenshots = await listScreenshots(configuration, set.id);
    const finalIds = new Set(finalScreenshots.map((item) => item.id));
    const expectedNames = [...expectedExistingFileNames, ...appendFileNames];
    if (
      finalScreenshots.length !== expectedNames.length
      || !sameValues(names(finalScreenshots), expectedNames)
      || existingIds.some((id) => !finalIds.has(id))
      || newScreenshotIds.some((id) => !finalIds.has(id))
    ) {
      throw new Error(`Final verification failed for ${target.displayType}.`);
    }

    result.push({
      displayType: target.displayType,
      preserved: existingIds.length,
      appended: newScreenshotIds.length,
      screenshotIds: finalScreenshots.map((item) => item.id),
      fileNames: names(finalScreenshots),
    });
  }

  const summary = {
    ok: true,
    versionId: version.id,
    localizationId: localization.id,
    locale: LOCALE,
    sourceLocale: path.basename(screenshotRoot),
    result,
  };
  log(JSON.stringify(summary, null, 2));
  return summary;
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  appendAppStoreScreenshots().catch((error) => {
    const status = error && typeof error === "object" && "status" in error ? ` HTTP ${error.status}` : "";
    const codes = error && typeof error === "object" && Array.isArray(error.codes)
      ? ` [${error.codes.join(", ")}]`
      : "";
    console.error(`${error instanceof Error ? error.message : String(error)}${status}${codes}`);
    process.exitCode = 1;
  });
}
