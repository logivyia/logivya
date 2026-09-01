import { createHash } from "node:crypto";

import { prisma } from "@/server/db";
import { deleteMediaBytes, mediaFileReference, persistMediaBytes, persistMediaStream } from "@/server/media/message-attachments";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { readBoundedFormData, RequestBodyError } from "@/server/security/request-body";
import {
  MAX_UPLOAD_REQUEST_BYTES,
  UPLOAD_SIGNATURE_SAMPLE_BYTES,
  maxUploadBytesForPlatform,
  validateUpload,
  type MessageUploadPlatform,
} from "@/server/security/uploads";

export const runtime = "nodejs";

function uploadError(error: Error) {
  if (error.message === "UPLOAD_PHOTO_TOO_LARGE") return mobileError(error.message, "Fotoğraf en fazla 10 MB olabilir.", { status: 413 });
  if (error.message === "UPLOAD_FILE_SIZE_NOT_ALLOWED" || error.message === "UPLOAD_FILE_SIZE_MISMATCH") return mobileError(error.message, "Dosya en fazla 25 MB olabilir.", { status: 413 });
  if (error.message.startsWith("UPLOAD_") || error.message === "MEDIA_STORAGE_KEY_INVALID") return mobileError(error.message, "Bu dosya türü veya dosya içeriği desteklenmiyor.", { status: 400 });
  return null;
}

function rawUploadError(error: Error, platform: MessageUploadPlatform) {
  if (error.message === "UPLOAD_FILE_SIZE_NOT_ALLOWED" || error.message === "UPLOAD_FILE_SIZE_MISMATCH") {
    const maximumMb = Math.floor(maxUploadBytesForPlatform(platform) / 1_000_000);
    return mobileError(error.message, `Bu platformda dosya başına en fazla ${maximumMb} MB yükleyebilirsiniz.`, { status: 413 });
  }
  if (error.message.startsWith("UPLOAD_") || error.message === "MEDIA_STORAGE_KEY_INVALID") {
    return mobileError(error.message, "Bu dosya türü veya dosya içeriği desteklenmiyor.", { status: 400 });
  }
  return null;
}

function parsePlatform(request: Request): MessageUploadPlatform | null {
  const value = request.headers.get("x-message-platform")?.trim().toUpperCase();
  return value === "WHATSAPP" || value === "TELEGRAM" ? value : null;
}

function decodeFileName(value: string | null) {
  if (!value) throw new Error("UPLOAD_FILE_NAME_REQUIRED");
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error("UPLOAD_FILE_NAME_INVALID");
  }
}

export async function PUT(request: Request) {
  let storedKey: string | null = null;
  let platform: MessageUploadPlatform = "WHATSAPP";
  try {
    const context = await requireMobileAuth(request);
    await enforceOperationRateLimit({ scope: "message.media.upload", subject: `${context.company.id}:${context.user.id}`, maxAttempts: 60, windowMs: 60_000, request });
    const parsedPlatform = parsePlatform(request);
    if (!parsedPlatform) return mobileError("UPLOAD_PLATFORM_REQUIRED", "Mesaj platformu seçilmelidir.", { status: 400 });
    platform = parsedPlatform;
    const clientDeclaredSize = Number(request.headers.get("x-file-size") || 0);
    const contentLength = Number(request.headers.get("content-length") || 0);
    const declaredSize = contentLength > 0 ? contentLength : clientDeclaredSize;
    if (!request.body) return mobileError("UPLOAD_FILE_REQUIRED", "Fotoğraf, video veya belge seçin.", { status: 400 });
    const fileName = decodeFileName(request.headers.get("x-file-name"));
    const mimeType = request.headers.get("content-type") || "application/octet-stream";
    const prepared = validateUpload({ companyId: context.company.id, fileName, mimeType, size: declaredSize, platform });
    storedKey = prepared.storageKey;
    const persisted = await persistMediaStream({
      storageKey: prepared.storageKey,
      body: request.body,
      expectedSize: declaredSize,
      sampleBytes: UPLOAD_SIGNATURE_SAMPLE_BYTES,
      validateSample: (buffer) => {
        validateUpload({ companyId: context.company.id, fileName, mimeType, size: declaredSize, platform, buffer, bufferIsComplete: false });
      },
    });
    const file = await prisma.mediaFile.create({
      data: { companyId: context.company.id, uploadedById: context.user.id, fileName: prepared.fileName, mimeType: prepared.mimeType, size: persisted.size, storageKey: prepared.storageKey, publicUrl: null },
    });
    return mobileSuccess({ attachment: mediaFileReference(file), checksum: persisted.checksum }, { status: 201 });
  } catch (error) {
    if (storedKey) await deleteMediaBytes(storedKey).catch(() => undefined);
    if (error instanceof Error) {
      const response = rawUploadError(error, platform);
      if (response) return response;
    }
    return mobileSafeError(error, "Dosya yüklenemedi.");
  }
}

export async function POST(request: Request) {
  let storedKey: string | null = null;
  try {
    const context = await requireMobileAuth(request);
    await enforceOperationRateLimit({ scope: "message.media.upload", subject: `${context.company.id}:${context.user.id}`, maxAttempts: 30, windowMs: 60_000, request });
    const form = await readBoundedFormData(request, MAX_UPLOAD_REQUEST_BYTES);
    const value = form.get("file");
    if (!value || typeof value === "string" || typeof value.arrayBuffer !== "function") return mobileError("UPLOAD_FILE_REQUIRED", "Fotoğraf, video veya belge seçin.", { status: 400 });
    const data = Buffer.from(await value.arrayBuffer());
    const validated = validateUpload({ companyId: context.company.id, fileName: value.name, mimeType: value.type, size: data.length, buffer: data });
    storedKey = validated.storageKey;
    await persistMediaBytes(validated.storageKey, data);
    const file = await prisma.mediaFile.create({
      data: { companyId: context.company.id, uploadedById: context.user.id, fileName: validated.fileName, mimeType: validated.mimeType, size: data.length, storageKey: validated.storageKey, publicUrl: null },
    });
    return mobileSuccess({ attachment: mediaFileReference(file), checksum: createHash("sha256").update(data).digest("hex") }, { status: 201 });
  } catch (error) {
    if (storedKey) await deleteMediaBytes(storedKey).catch(() => undefined);
    if (error instanceof RequestBodyError) {
      return mobileError(error.code === "REQUEST_BODY_TOO_LARGE" ? "UPLOAD_REQUEST_TOO_LARGE" : error.code, "Dosya yükleme isteği kabul edilmedi.", { status: error.status });
    }
    if (error instanceof Error) {
      const response = uploadError(error);
      if (response) return response;
    }
    return mobileSafeError(error, "Dosya yüklenemedi.");
  }
}
