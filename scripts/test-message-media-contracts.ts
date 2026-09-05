import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  MAX_MESSAGE_ATTACHMENTS,
  TELEGRAM_MAX_UPLOAD_BYTES,
  WHATSAPP_MAX_UPLOAD_BYTES,
  validateUpload,
} from "../src/server/security/uploads";
import {
  assertWhatsAppMediaUploadResult,
  buildWhatsAppOutboundPayload,
} from "../src/server/whatsapp/outbound-payload";
import type { WhatsAppOutboundAttachment } from "../src/server/whatsapp/provider";

const root = process.cwd();
const source = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const photo = validateUpload({ companyId: "company-1", fileName: "katalog.jpg", mimeType: "image/jpeg", size: jpeg.length, buffer: jpeg });
assert.equal(photo.kind, "PHOTO");
assert.match(photo.storageKey, /^company-1\/\d{4}-\d{2}\/[a-f0-9-]+\.jpg$/u);

const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n", "ascii");
assert.equal(validateUpload({ companyId: "company-1", fileName: "katalog.pdf", mimeType: "application/pdf", size: pdf.length, buffer: pdf }).kind, "DOCUMENT");

const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("[Content_Types].xml word/document.xml", "latin1")]);
assert.equal(validateUpload({ companyId: "company-1", fileName: "teklif.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: docx.length, buffer: docx }).kind, "DOCUMENT");

assert.throws(() => validateUpload({ companyId: "company-1", fileName: "zararli.pdf", mimeType: "application/pdf", size: 4, buffer: Buffer.from("MZ!!") }), /UPLOAD_EXECUTABLE_REJECTED/u);
assert.throws(() => validateUpload({ companyId: "company-1", fileName: "sahte.pdf", mimeType: "application/pdf", size: jpeg.length, buffer: jpeg }), /UPLOAD_FILE_SIGNATURE_INVALID/u);
assert.throws(() => validateUpload({ companyId: "company-1", fileName: "sahte.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 4, buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]) }), /UPLOAD_OFFICE_CONTAINER_INVALID/u);
assert.doesNotThrow(() => validateUpload({ companyId: "company-1", fileName: "katalog.pdf", mimeType: "application/pdf", size: WHATSAPP_MAX_UPLOAD_BYTES, platform: "WHATSAPP", buffer: pdf, bufferIsComplete: false }));
assert.throws(() => validateUpload({ companyId: "company-1", fileName: "katalog.pdf", mimeType: "application/pdf", size: WHATSAPP_MAX_UPLOAD_BYTES + 1, platform: "WHATSAPP" }), /UPLOAD_FILE_SIZE_NOT_ALLOWED/u);
assert.doesNotThrow(() => validateUpload({ companyId: "company-1", fileName: "arsiv.pdf", mimeType: "application/pdf", size: TELEGRAM_MAX_UPLOAD_BYTES, platform: "TELEGRAM", buffer: pdf, bufferIsComplete: false }));
assert.equal(MAX_MESSAGE_ATTACHMENTS, 30);

const photoAttachment: WhatsAppOutboundAttachment = {
  mediaFileId: "media-photo",
  kind: "PHOTO",
  fileName: "katalog.jpg",
  mimeType: "image/jpeg",
  size: jpeg.length,
  filePath: "/app/media/katalog.jpg",
};
assert.deepEqual(buildWhatsAppOutboundPayload({ content: "Yeni katalog", attachment: photoAttachment }), {
  image: { url: photoAttachment.filePath },
  mimetype: photoAttachment.mimeType,
  caption: "Yeni katalog",
});
assert.deepEqual(buildWhatsAppOutboundPayload({ content: "", attachment: { ...photoAttachment, kind: "VIDEO", mimeType: "video/mp4" } }), {
  video: { url: photoAttachment.filePath },
  mimetype: "video/mp4",
  caption: undefined,
});
assert.deepEqual(buildWhatsAppOutboundPayload({ content: "Teklif belgesi", attachment: { ...photoAttachment, kind: "DOCUMENT", fileName: "teklif.pdf", mimeType: "application/pdf" } }), {
  document: { url: photoAttachment.filePath },
  mimetype: "application/pdf",
  fileName: "teklif.pdf",
  caption: "Teklif belgesi",
});
assert.doesNotThrow(() => assertWhatsAppMediaUploadResult({
  message: {
    imageMessage: {
      url: "https://mmg.whatsapp.net/media",
      mediaKey: new Uint8Array([1]),
      fileSha256: new Uint8Array([2]),
      fileEncSha256: new Uint8Array([3]),
    },
  },
} as never, photoAttachment));
assert.throws(() => assertWhatsAppMediaUploadResult({ message: { imageMessage: {} } } as never, photoAttachment), /WHATSAPP_MEDIA_UPLOAD_CONFIRMATION_MISSING/u);

const uploadRoute = source("src/app/api/mobile/media/upload/route.ts");
assert.match(uploadRoute, /requireMobileAuth\(request\)/u);
assert.match(uploadRoute, /readBoundedFormData\(request, MAX_UPLOAD_REQUEST_BYTES\)/u);
assert.doesNotMatch(uploadRoute, /await request\.formData\(\)/u, "Multipart parsing must never consume an unbounded network stream.");
assert.match(uploadRoute, /export async function PUT\(request: Request\)/u);
assert.match(uploadRoute, /persistMediaStream/u);
assert.match(uploadRoute, /x-message-platform/u);
assert.match(uploadRoute, /const declaredSize = contentLength > 0 \? contentLength : clientDeclaredSize/u);
assert.match(uploadRoute, /publicUrl:\s*null/u);
assert.doesNotMatch(uploadRoute, /public-read|ACL/u);

const pipeline = source("src/server/messages/delivery-pipeline.ts");
assert.match(pipeline, /resolveOwnedMediaFiles/u);
assert.match(pipeline, /attachments:\s*attachments\.length/u);
assert.match(pipeline, /WHATSAPP_MAX_UPLOAD_BYTES/u);

const whatsapp = source("src/worker/baileys-provider.ts");
const whatsappPayload = source("src/server/whatsapp/outbound-payload.ts");
assert.match(whatsappPayload, /image:\s*\{ url: input\.attachment\.filePath \}/u);
assert.match(whatsappPayload, /video:\s*\{ url: input\.attachment\.filePath \}/u);
assert.match(whatsappPayload, /document:\s*\{ url: input\.attachment\.filePath \}/u);
assert.match(whatsapp, /message-receipt\.update/u);
assert.match(whatsapp, /assertWhatsAppMediaUploadResult/u);
assert.match(whatsapp, /message\.baileys\.media_ack\.pending/u);

const whatsappWorker = source("src/worker/index.ts");
assert.match(whatsappWorker, /loadOutboundMessageAttachments/u);
assert.match(whatsappWorker, /for \(let partIndex = messageKeys\.length; partIndex < totalMessageParts/u);
assert.match(whatsappWorker, /serializeStoredMessageKeys\(messageKeys\)/u);
assert.match(whatsappWorker, /finalRecipientStatus = allMessagePartsDelivered \? "DELIVERED" : "SENT"/u);

const telegram = source("src/server/telegram/tdlib-client.ts");
assert.match(telegram, /inputMessagePhoto/u);
assert.match(telegram, /inputMessageVideo/u);
assert.match(telegram, /inputMessageDocument/u);
assert.match(telegram, /path: input\.attachment\.filePath/u);

const telegramWorker = source("src/server/telegram/dispatch-worker.ts");
assert.match(telegramWorker, /loadOutboundMessageAttachments/u);
assert.match(telegramWorker, /decodeTelegramExternalMessageIds/u);
assert.match(telegramWorker, /for \(let partIndex = externalMessageIds\.length; partIndex < totalMessageParts/u);

const picker = source("apps/mobile/src/components/message-attachment-picker.tsx");
assert.match(picker, /pickMessagePhotos/u);
assert.match(picker, /pickMessageVideos/u);
assert.match(picker, /pickMessageDocuments/u);
assert.match(picker, /merged\.length > MAX_MESSAGE_ATTACHMENTS/u);

const mobileMedia = source("apps/mobile/src/api/mobileMedia.ts");
assert.match(mobileMedia, /localFile\.exists && localFile\.size > 0 \? localFile\.size : file\.size/u);
assert.match(mobileMedia, /fileNameForMimeType/u);
assert.match(mobileMedia, /detectedMimeType/u);
assert.doesNotMatch(mobileMedia, /"Content-Length": String\(resolved\.size\)/u);

const mobileClient = source("apps/mobile/src/api/client.ts");
assert.match(mobileClient, /headers\.delete\("Content-Length"\)/u);
assert.match(mobileClient, /headers\.set\("X-File-Size", String\(nativeFile\.size\)\)/u);

const messagingScreen = source("apps/mobile/src/screens/app/messaging-screen.tsx");
assert.match(messagingScreen, /content,\s*\.\.\.\(uploaded\.length \? \{ mediaFileIds:/u);

const productionCompose = source("ops/vps/compose.app.yml");
assert.equal((productionCompose.match(/source:\s*\/opt\/logivya\/data\/media/gu) || []).length, 3);
assert.equal((productionCompose.match(/target:\s*\/app\/media/gu) || []).length, 3);

console.log("Message media contracts passed.");
