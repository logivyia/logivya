import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { open, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  AppleConfigurationError,
  AppStoreConnectError,
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";

function requiredEnvironmentValue(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new AppleConfigurationError(`${name} is required.`);
  return value;
}

async function checksum(filePath, algorithm) {
  const digest = createHash(algorithm);
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest("hex");
}

async function uploadOperation(fileHandle, operation) {
  const length = Number(operation.length);
  const offset = Number(operation.offset);
  if (!Number.isSafeInteger(length) || length < 1 || !Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("Apple returned an invalid upload byte range.");
  }

  const buffer = Buffer.allocUnsafe(length);
  const { bytesRead } = await fileHandle.read(buffer, 0, length, offset);
  if (bytesRead !== length) throw new Error("The IPA could not be read completely for an upload part.");

  const url = new URL(operation.url);
  if (url.protocol !== "https:") throw new Error("Apple returned a non-HTTPS upload URL.");

  const headers = Object.fromEntries(
    (operation.requestHeaders ?? []).map(({ name, value }) => [String(name), String(value)]),
  );
  const response = await fetch(url, {
    method: operation.method || "PUT",
    headers,
    body: buffer,
    redirect: "error",
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`IPA part upload failed with HTTP ${response.status}.`);
}

async function waitForUpload(configuration, uploadId) {
  const deadline = Date.now() + 20 * 60_000;
  while (Date.now() < deadline) {
    const result = await appStoreConnectRequest(
      configuration,
      `/v1/buildUploads/${uploadId}`,
      {
        "fields[buildUploads]":
          "cfBundleShortVersionString,cfBundleVersion,createdDate,state,platform,uploadedDate",
      },
      { timeoutMs: 60_000 },
    );
    const state = result.payload?.data?.attributes?.state;
    if (state?.state === "COMPLETE") return state;
    if (state?.state === "FAILED") {
      const codes = (state.errors ?? []).map((item) => item.code || item.description).filter(Boolean);
      throw new Error(`Apple rejected the build upload${codes.length ? `: ${codes.join(", ")}` : "."}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  throw new Error("Apple build upload processing did not finish within 20 minutes.");
}

try {
  const configuration = loadAppleConfiguration();
  const ipaPath = path.resolve(requiredEnvironmentValue("IOS_IPA_PATH"));
  const buildNumber = requiredEnvironmentValue("IOS_BUILD_NUMBER");
  const marketingVersion = requiredEnvironmentValue("IOS_MARKETING_VERSION");
  if (!existsSync(ipaPath) || path.extname(ipaPath).toLowerCase() !== ".ipa") {
    throw new AppleConfigurationError("IOS_IPA_PATH must reference an existing .ipa file.");
  }
  if (!/^\d+$/u.test(buildNumber)) {
    throw new AppleConfigurationError("IOS_BUILD_NUMBER must be numeric.");
  }

  const existing = await appStoreConnectRequest(configuration, "/v1/builds", {
    "filter[app]": configuration.appStoreAppId,
    "filter[version]": buildNumber,
    limit: 1,
  });
  if ((existing.payload?.data ?? []).length > 0) {
    console.log(JSON.stringify({ ok: true, alreadyUploaded: true, buildNumber }, null, 2));
    process.exit(0);
  }

  const file = await stat(ipaPath);
  const upload = await appStoreConnectRequest(configuration, "/v1/buildUploads", {}, {
    method: "POST",
    body: {
      data: {
        type: "buildUploads",
        attributes: {
          cfBundleShortVersionString: marketingVersion,
          cfBundleVersion: buildNumber,
          platform: "IOS",
        },
        relationships: {
          app: { data: { type: "apps", id: configuration.appStoreAppId } },
        },
      },
    },
  });
  const uploadId = upload.payload?.data?.id;
  if (!uploadId) throw new Error("Apple did not return a build upload identifier.");

  const reservation = await appStoreConnectRequest(configuration, "/v1/buildUploadFiles", {}, {
    method: "POST",
    body: {
      data: {
        type: "buildUploadFiles",
        attributes: {
          assetType: "ASSET",
          fileName: path.basename(ipaPath),
          fileSize: file.size,
          uti: "com.apple.ipa",
        },
        relationships: {
          buildUpload: { data: { type: "buildUploads", id: uploadId } },
        },
      },
    },
  });
  const uploadFile = reservation.payload?.data;
  const operations = uploadFile?.attributes?.uploadOperations ?? [];
  if (!uploadFile?.id || operations.length === 0) {
    throw new Error("Apple did not return IPA upload operations.");
  }

  const fileHandle = await open(ipaPath, "r");
  try {
    for (const operation of operations) await uploadOperation(fileHandle, operation);
  } finally {
    await fileHandle.close();
  }

  const md5 = await checksum(ipaPath, "md5");
  await appStoreConnectRequest(configuration, `/v1/buildUploadFiles/${uploadFile.id}`, {}, {
    method: "PATCH",
    body: {
      data: {
        type: "buildUploadFiles",
        id: uploadFile.id,
        attributes: {
          uploaded: true,
          sourceFileChecksums: {
            file: { hash: md5, algorithm: "MD5" },
          },
        },
      },
    },
  });

  const finalState = await waitForUpload(configuration, uploadId);
  console.log(JSON.stringify({
    ok: true,
    alreadyUploaded: false,
    buildNumber,
    marketingVersion,
    uploadId,
    uploadedParts: operations.length,
    state: finalState.state,
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
