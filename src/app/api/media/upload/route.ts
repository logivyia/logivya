import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { deleteMediaBytes, mediaFileReference, persistMediaBytes, persistMediaStream } from "@/server/media/message-attachments";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { readBoundedFormData, RequestBodyError } from "@/server/security/request-body";
import { MAX_UPLOAD_REQUEST_BYTES, UPLOAD_SIGNATURE_SAMPLE_BYTES, validateUpload, type MessageUploadPlatform } from "@/server/security/uploads";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  let storedKey: string | null = null;
  try {
    const { company, user } = await requireApiSession();
    await enforceOperationRateLimit({
      scope: "message.media.upload",
      subject: `${company.id}:${user.id}`,
      maxAttempts: 60,
      windowMs: 60_000,
      request,
    });
    const platform = parsePlatform(request.headers.get("x-message-platform"));
    const declaredSize = Number(request.headers.get("x-file-size") || request.headers.get("content-length") || 0);
    const fileName = decodeFileName(request.headers.get("x-file-name"));
    const mimeType = request.headers.get("content-type") || "application/octet-stream";
    if (!request.body) return NextResponse.json({ ok: false, error: "UPLOAD_FILE_REQUIRED" }, { status: 400 });
    const prepared = validateUpload({ companyId: company.id, fileName, mimeType, size: declaredSize, platform });
    storedKey = prepared.storageKey;
    const persisted = await persistMediaStream({
      storageKey: prepared.storageKey,
      body: request.body,
      expectedSize: declaredSize,
      sampleBytes: UPLOAD_SIGNATURE_SAMPLE_BYTES,
      validateSample: (buffer) => {
        validateUpload({ companyId: company.id, fileName, mimeType, size: declaredSize, platform, buffer, bufferIsComplete: false });
      },
    });
    const file = await prisma.mediaFile.create({
      data: {
        companyId: company.id,
        uploadedById: user.id,
        fileName: prepared.fileName,
        mimeType: prepared.mimeType,
        size: persisted.size,
        storageKey: prepared.storageKey,
        publicUrl: null,
      },
    });
    return NextResponse.json({ ok: true, attachment: mediaFileReference(file), checksum: persisted.checksum }, { status: 201 });
  } catch (error) {
    if (storedKey) await deleteMediaBytes(storedKey).catch(() => undefined);
    return uploadErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let storedKey: string | null = null;
  try {
    const { company, user } = await requireApiSession();
    await enforceOperationRateLimit({
      scope: "message.media.upload",
      subject: `${company.id}:${user.id}`,
      maxAttempts: 30,
      windowMs: 60_000,
      request,
    });
    const platform = parsePlatform(request.headers.get("x-message-platform"));
    const form = await readBoundedFormData(request, MAX_UPLOAD_REQUEST_BYTES);
    const value = form.get("file");
    if (!value || typeof value === "string" || typeof value.arrayBuffer !== "function") {
      return NextResponse.json({ ok: false, error: "UPLOAD_FILE_REQUIRED" }, { status: 400 });
    }
    const data = Buffer.from(await value.arrayBuffer());
    const validated = validateUpload({
      companyId: company.id,
      fileName: value.name,
      mimeType: value.type,
      size: data.length,
      buffer: data,
      platform,
    });
    storedKey = validated.storageKey;
    await persistMediaBytes(validated.storageKey, data);
    const file = await prisma.mediaFile.create({
      data: {
        companyId: company.id,
        uploadedById: user.id,
        fileName: validated.fileName,
        mimeType: validated.mimeType,
        size: data.length,
        storageKey: validated.storageKey,
        publicUrl: null,
      },
    });
    return NextResponse.json({
      ok: true,
      attachment: mediaFileReference(file),
      checksum: createHash("sha256").update(data).digest("hex"),
    }, { status: 201 });
  } catch (error) {
    if (storedKey) await deleteMediaBytes(storedKey).catch(() => undefined);
    return uploadErrorResponse(error);
  }
}

function parsePlatform(value: string | null): MessageUploadPlatform {
  return value?.trim().toUpperCase() === "TELEGRAM" ? "TELEGRAM" : "WHATSAPP";
}

function decodeFileName(value: string | null) {
  if (!value) throw new Error("UPLOAD_FILE_NAME_REQUIRED");
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error("UPLOAD_FILE_NAME_INVALID");
  }
}

function uploadErrorResponse(error: unknown) {
  if (error instanceof RequestBodyError) {
    return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
  }
  if (error instanceof Error && (error.message.startsWith("UPLOAD_") || error.message === "MEDIA_STORAGE_KEY_INVALID")) {
    const status = error.message.includes("TOO_LARGE") || error.message.includes("SIZE") ? 413 : 400;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  return NextResponse.json({ ok: false, error: "UPLOAD_FAILED" }, { status: 500 });
}
