import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

import { apiClient } from "@/api/client";

export type MobileMessageAttachmentKind = "PHOTO" | "VIDEO" | "DOCUMENT";

export type MobileMessageAttachment = {
  mediaFileId: string;
  kind: MobileMessageAttachmentKind;
  fileName: string;
  mimeType: string;
  size: number;
};

export type LocalMessageAttachment = Omit<MobileMessageAttachment, "mediaFileId"> & { uri: string };

export type MessageAttachmentPlatform = "WHATSAPP" | "TELEGRAM";

export const MAX_MESSAGE_ATTACHMENTS = 30;
export const WHATSAPP_MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
export const TELEGRAM_MAX_ATTACHMENT_BYTES = 2_000_000_000;

export function maxAttachmentBytes(platform: MessageAttachmentPlatform) {
  return platform === "WHATSAPP" ? WHATSAPP_MAX_ATTACHMENT_BYTES : TELEGRAM_MAX_ATTACHMENT_BYTES;
}

const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
];

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  mp4: "video/mp4", mov: "video/quicktime", pdf: "application/pdf",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain", csv: "text/csv",
};

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
};

function extension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function normalizedMimeType(fileName: string, mimeType?: string | null) {
  const declared = mimeType?.toLowerCase().split(";", 1)[0];
  if (declared && declared !== "application/octet-stream" && EXTENSION_BY_MIME[declared]) return declared;
  const inferred = MIME_BY_EXTENSION[extension(fileName)];
  if (inferred) return inferred;
  return "application/octet-stream";
}

function fileNameForMimeType(fileName: string, mimeType: string, kind: MobileMessageAttachmentKind) {
  const expectedExtension = EXTENSION_BY_MIME[mimeType];
  if (!expectedExtension || MIME_BY_EXTENSION[extension(fileName)] === mimeType) return fileName;
  const currentExtension = extension(fileName);
  const stem = currentExtension ? fileName.slice(0, -(currentExtension.length + 1)) : fileName;
  const fallbackStem = kind === "PHOTO" ? "fotograf" : kind === "VIDEO" ? "video" : "belge";
  return `${stem.trim() || fallbackStem}.${expectedExtension}`;
}

function detectedMimeType(localFile: File) {
  let handle: ReturnType<File["open"]> | null = null;
  try {
    handle = localFile.open();
    const bytes = handle.readBytes(16);
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) return "image/png";
    if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
    if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") return "video/mp4";
    if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
  } catch {
    return null;
  } finally {
    handle?.close();
  }
  return null;
}

function fallbackFileName(uri: string, kind: MobileMessageAttachmentKind) {
  const raw = decodeURIComponent(uri.split("/").pop()?.split("?")[0] || "");
  if (raw.includes(".")) return raw;
  return `${kind === "PHOTO" ? "fotograf.jpg" : kind === "VIDEO" ? "video.mp4" : "belge.pdf"}`;
}

async function ensureMediaLibraryPermission() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("Fotoğraf ve video seçebilmek için galeri izni verin.");
}

export async function pickMessagePhoto(): Promise<LocalMessageAttachment | null> {
  await ensureMediaLibraryPermission();
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    allowsMultipleSelection: true,
    selectionLimit: MAX_MESSAGE_ATTACHMENTS,
    quality: 0.9,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (result.canceled) return null;
  const attachments = await Promise.all(result.assets.map(async (asset) => {
    const fileName = asset.fileName || fallbackFileName(asset.uri, "PHOTO");
    return withResolvedSize({ uri: asset.uri, kind: "PHOTO" as const, fileName, mimeType: normalizedMimeType(fileName, asset.mimeType), size: asset.fileSize || 0 });
  }));
  return attachments[0] || null;
}

export async function pickMessagePhotos(): Promise<LocalMessageAttachment[]> {
  await ensureMediaLibraryPermission();
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    allowsMultipleSelection: true,
    selectionLimit: MAX_MESSAGE_ATTACHMENTS,
    quality: 0.9,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (result.canceled) return [];
  return Promise.all(result.assets.map(async (asset) => {
    const fileName = asset.fileName || fallbackFileName(asset.uri, "PHOTO");
    return withResolvedSize({ uri: asset.uri, kind: "PHOTO" as const, fileName, mimeType: normalizedMimeType(fileName, asset.mimeType), size: asset.fileSize || 0 });
  }));
}

export async function pickMessageVideo(): Promise<LocalMessageAttachment | null> {
  await ensureMediaLibraryPermission();
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["videos"],
    allowsEditing: false,
    allowsMultipleSelection: true,
    selectionLimit: MAX_MESSAGE_ATTACHMENTS,
    quality: 1,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (result.canceled) return null;
  const attachments = await Promise.all(result.assets.map(async (asset) => {
    const fileName = asset.fileName || fallbackFileName(asset.uri, "VIDEO");
    return withResolvedSize({ uri: asset.uri, kind: "VIDEO" as const, fileName, mimeType: normalizedMimeType(fileName, asset.mimeType), size: asset.fileSize || 0 });
  }));
  return attachments[0] || null;
}

export async function pickMessageVideos(): Promise<LocalMessageAttachment[]> {
  await ensureMediaLibraryPermission();
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["videos"],
    allowsEditing: false,
    allowsMultipleSelection: true,
    selectionLimit: MAX_MESSAGE_ATTACHMENTS,
    quality: 1,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (result.canceled) return [];
  return Promise.all(result.assets.map(async (asset) => {
    const fileName = asset.fileName || fallbackFileName(asset.uri, "VIDEO");
    return withResolvedSize({ uri: asset.uri, kind: "VIDEO" as const, fileName, mimeType: normalizedMimeType(fileName, asset.mimeType), size: asset.fileSize || 0 });
  }));
}

export async function pickMessageDocument(): Promise<LocalMessageAttachment | null> {
  const attachments = await pickMessageDocuments();
  return attachments[0] || null;
}

export async function pickMessageDocuments(): Promise<LocalMessageAttachment[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: DOCUMENT_MIME_TYPES, copyToCacheDirectory: true, multiple: true });
  if (result.canceled) return [];
  return Promise.all(result.assets.map((asset) => withResolvedSize({ uri: asset.uri, kind: "DOCUMENT" as const, fileName: asset.name, mimeType: normalizedMimeType(asset.name, asset.mimeType), size: asset.size || 0 })));
}

async function withResolvedSize(file: LocalMessageAttachment) {
  const localFile = new File(file.uri);
  const actualSize = localFile.exists && localFile.size > 0 ? localFile.size : file.size;
  if (actualSize <= 0) throw new Error("Dosya boyutu belirlenemedi.");
  const actualMimeType = detectedMimeType(localFile) || normalizedMimeType(file.fileName, localFile.type || file.mimeType);
  return {
    ...file,
    fileName: fileNameForMimeType(file.fileName, actualMimeType, file.kind),
    mimeType: actualMimeType,
    size: actualSize,
  };
}

export async function uploadMobileMessageAttachment(
  file: LocalMessageAttachment,
  platform: MessageAttachmentPlatform,
  signal?: AbortSignal,
) {
  const resolved = await withResolvedSize(file);
  return apiClient.uploadFile<{ attachment: MobileMessageAttachment; checksum: string }>(
    "/api/mobile/media/upload",
    resolved.uri,
    {
      "Content-Type": resolved.mimeType,
      "X-File-Name": encodeURIComponent(resolved.fileName),
      "X-File-Size": String(resolved.size),
      "X-Message-Platform": platform,
    },
    true,
    signal,
  );
}

export async function uploadMobileMessageAttachments(
  files: LocalMessageAttachment[],
  platform: MessageAttachmentPlatform,
  options?: {
    signal?: AbortSignal;
    onProgress?: (progress: { completed: number; currentIndex: number; total: number }) => void;
  },
) {
  const uploaded: Array<{ attachment: MobileMessageAttachment; checksum: string }> = [];
  for (let currentIndex = 0; currentIndex < files.length; currentIndex += 1) {
    if (options?.signal?.aborted) throw new Error("UPLOAD_CANCELED");
    options?.onProgress?.({ completed: currentIndex, currentIndex, total: files.length });
    uploaded.push(await uploadMobileMessageAttachment(files[currentIndex]!, platform, options?.signal));
    options?.onProgress?.({ completed: currentIndex + 1, currentIndex, total: files.length });
  }
  return uploaded;
}
