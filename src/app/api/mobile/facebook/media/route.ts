import { prisma } from "@/server/db";
import { assertFacebookPublisher, requireFacebookPagesAccess } from "@/server/facebook/access";
import { facebookSafeError } from "@/server/facebook/response";
import { deleteMediaBytes, mediaFileReference, persistMediaStream } from "@/server/media/message-attachments";
import { mobileError, mobileSuccess } from "@/server/mobile/response";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { UPLOAD_SIGNATURE_SAMPLE_BYTES, validateUpload } from "@/server/security/uploads";

export const runtime = "nodejs";

function decodeFileName(value: string | null) {
  if (!value) throw new Error("FACEBOOK_VALIDATION_FILE_NAME_REQUIRED");
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error("FACEBOOK_VALIDATION_FILE_NAME_INVALID");
  }
}

export async function PUT(request: Request) {
  let storedKey: string | null = null;
  try {
    const auth = await requireFacebookPagesAccess(request);
    assertFacebookPublisher(auth);
    await enforceOperationRateLimit({
      scope: "facebook.media.upload",
      subject: `${auth.company.id}:${auth.user.id}`,
      maxAttempts: 30,
      windowMs: 60_000,
      request,
    });
    const declaredSize = Number(request.headers.get("x-file-size") || request.headers.get("content-length") || 0);
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 0 && declaredSize !== contentLength) throw new Error("FACEBOOK_VALIDATION_FILE_SIZE_MISMATCH");
    if (!request.body) throw new Error("FACEBOOK_VALIDATION_FILE_REQUIRED");
    const fileName = decodeFileName(request.headers.get("x-file-name"));
    const mimeType = request.headers.get("content-type") || "application/octet-stream";
    const prepared = validateUpload({ companyId: auth.company.id, fileName, mimeType, size: declaredSize, platform: "WHATSAPP" });
    if (prepared.kind === "DOCUMENT") throw new Error("FACEBOOK_VALIDATION_DOCUMENT_UNSUPPORTED");
    storedKey = prepared.storageKey;
    const persisted = await persistMediaStream({
      storageKey: prepared.storageKey,
      body: request.body,
      expectedSize: declaredSize,
      sampleBytes: UPLOAD_SIGNATURE_SAMPLE_BYTES,
      validateSample: (buffer) => {
        const validated = validateUpload({ companyId: auth.company.id, fileName, mimeType, size: declaredSize, platform: "WHATSAPP", buffer, bufferIsComplete: false });
        if (validated.kind === "DOCUMENT") throw new Error("FACEBOOK_VALIDATION_DOCUMENT_UNSUPPORTED");
      },
    });
    const file = await prisma.mediaFile.create({
      data: {
        companyId: auth.company.id,
        uploadedById: auth.user.id,
        fileName: prepared.fileName,
        mimeType: prepared.mimeType,
        size: persisted.size,
        storageKey: prepared.storageKey,
        publicUrl: null,
        purpose: "FACEBOOK_PAGE_POST",
        expiresAt: new Date(Date.now() + 37 * 24 * 60 * 60_000),
      },
    });
    return mobileSuccess({ attachment: mediaFileReference(file), checksum: persisted.checksum }, { status: 201 });
  } catch (error) {
    if (storedKey) await deleteMediaBytes(storedKey).catch(() => undefined);
    if (error instanceof Error && (error.message.startsWith("UPLOAD_") || error.message.startsWith("FACEBOOK_VALIDATION_"))) {
      return mobileError(error.message, "Facebook için JPG, PNG, WEBP, MP4 veya MOV dosyası seçin. Dosya en fazla 100 MB olabilir.", { status: error.message.includes("SIZE") ? 413 : 400 });
    }
    return facebookSafeError(error);
  }
}
