import { randomUUID } from "node:crypto";
import { extname } from "node:path";

export type MessageAttachmentKind = "PHOTO" | "VIDEO" | "DOCUMENT";
export type MessageUploadPlatform = "WHATSAPP" | "TELEGRAM";

type UploadRule = {
  kind: MessageAttachmentKind;
  mimeTypes: readonly string[];
  magic: "JPEG" | "PNG" | "WEBP" | "MP4" | "QUICKTIME" | "PDF" | "OLE" | "ZIP" | "TEXT";
};

const RULES = new Map<string, UploadRule>([
  [".jpg", { kind: "PHOTO", mimeTypes: ["image/jpeg"], magic: "JPEG" }],
  [".jpeg", { kind: "PHOTO", mimeTypes: ["image/jpeg"], magic: "JPEG" }],
  [".png", { kind: "PHOTO", mimeTypes: ["image/png"], magic: "PNG" }],
  [".webp", { kind: "PHOTO", mimeTypes: ["image/webp"], magic: "WEBP" }],
  [".mp4", { kind: "VIDEO", mimeTypes: ["video/mp4"], magic: "MP4" }],
  [".mov", { kind: "VIDEO", mimeTypes: ["video/quicktime"], magic: "QUICKTIME" }],
  [".pdf", { kind: "DOCUMENT", mimeTypes: ["application/pdf"], magic: "PDF" }],
  [".doc", { kind: "DOCUMENT", mimeTypes: ["application/msword"], magic: "OLE" }],
  [".docx", { kind: "DOCUMENT", mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], magic: "ZIP" }],
  [".xls", { kind: "DOCUMENT", mimeTypes: ["application/vnd.ms-excel"], magic: "OLE" }],
  [".xlsx", { kind: "DOCUMENT", mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], magic: "ZIP" }],
  [".ppt", { kind: "DOCUMENT", mimeTypes: ["application/vnd.ms-powerpoint"], magic: "OLE" }],
  [".pptx", { kind: "DOCUMENT", mimeTypes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"], magic: "ZIP" }],
  [".txt", { kind: "DOCUMENT", mimeTypes: ["text/plain"], magic: "TEXT" }],
  [".csv", { kind: "DOCUMENT", mimeTypes: ["text/csv", "text/plain", "application/vnd.ms-excel"], magic: "TEXT" }],
]);

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_PHOTO_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_REQUEST_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024;
export const WHATSAPP_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
// Telegram's standard account limit is 2 GB. Decimal bytes keep the value
// within PostgreSQL's signed Int range used by MediaFile.size.
export const TELEGRAM_MAX_UPLOAD_BYTES = 2_000_000_000;
export const MAX_MESSAGE_ATTACHMENTS = 30;
export const UPLOAD_SIGNATURE_SAMPLE_BYTES = 4 * 1024 * 1024;

export function maxUploadBytesForPlatform(platform: MessageUploadPlatform) {
  return platform === "TELEGRAM" ? TELEGRAM_MAX_UPLOAD_BYTES : WHATSAPP_MAX_UPLOAD_BYTES;
}

function startsWith(buffer: Buffer, signature: readonly number[], offset = 0) {
  return signature.every((value, index) => buffer[offset + index] === value);
}

function hasIsoBaseMediaBrand(buffer: Buffer) {
  return buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
}

function assertMagicBytes(buffer: Buffer, rule: UploadRule) {
  const valid = (() => {
    if (rule.magic === "JPEG") return startsWith(buffer, [0xff, 0xd8, 0xff]);
    if (rule.magic === "PNG") return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (rule.magic === "WEBP") return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
    if (rule.magic === "MP4" || rule.magic === "QUICKTIME") return hasIsoBaseMediaBrand(buffer);
    if (rule.magic === "PDF") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    if (rule.magic === "OLE") return startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    if (rule.magic === "ZIP") return startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buffer, [0x50, 0x4b, 0x05, 0x06]);
    if (rule.magic === "TEXT") {
      const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
      return !sample.includes(0) && !startsWith(sample, [0x4d, 0x5a]);
    }
    return false;
  })();
  if (!valid) throw new Error("UPLOAD_FILE_SIGNATURE_INVALID");
}

export function sanitizeUploadFileName(fileName: string) {
  const normalized = fileName.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/gu, "").replace(/[\\/]+/gu, "-").trim();
  const safe = normalized.replace(/[^\p{L}\p{N}._()\- ]/gu, "-").replace(/\s+/gu, " ").slice(0, 180);
  return safe || "belge";
}

export function validateUpload(input: {
  companyId: string;
  fileName: string;
  mimeType: string;
  size: number;
  platform?: MessageUploadPlatform;
  buffer?: Buffer;
  bufferIsComplete?: boolean;
}) {
  if (!input.companyId) throw new Error("UPLOAD_COMPANY_REQUIRED");
  const maximum = input.platform ? maxUploadBytesForPlatform(input.platform) : MAX_UPLOAD_BYTES;
  if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > maximum) throw new Error("UPLOAD_FILE_SIZE_NOT_ALLOWED");
  const fileName = sanitizeUploadFileName(input.fileName);
  const extension = extname(fileName).toLowerCase();
  const rule = RULES.get(extension);
  const mimeType = input.mimeType.trim().toLowerCase().split(";", 1)[0];
  if (!rule || !rule.mimeTypes.includes(mimeType)) throw new Error("UPLOAD_FILE_TYPE_NOT_ALLOWED");
  if (input.buffer) {
    if (input.bufferIsComplete !== false && input.buffer.length !== input.size) throw new Error("UPLOAD_FILE_SIZE_MISMATCH");
    if (startsWith(input.buffer, [0x4d, 0x5a])) throw new Error("UPLOAD_EXECUTABLE_REJECTED");
    assertMagicBytes(input.buffer, rule);
    if (!input.platform && rule.kind === "PHOTO" && input.size > MAX_PHOTO_UPLOAD_BYTES) throw new Error("UPLOAD_PHOTO_TOO_LARGE");
    if (rule.magic === "ZIP") {
      const directory = input.buffer.toString("latin1");
      const expectedPrefix = extension === ".docx" ? "word/" : extension === ".xlsx" ? "xl/" : "ppt/";
      if (!directory.includes("[Content_Types].xml") || !directory.includes(expectedPrefix)) throw new Error("UPLOAD_OFFICE_CONTAINER_INVALID");
    }
  }
  const month = new Date().toISOString().slice(0, 7);
  return {
    fileName,
    mimeType,
    kind: rule.kind,
    storageKey: `${input.companyId}/${month}/${randomUUID()}${extension}`,
  };
}
