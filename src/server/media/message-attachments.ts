import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { MediaFile } from "@prisma/client";

import { prisma } from "@/server/db";
import { readCampaignMetadata } from "@/server/messages/correlation";
import type { MessageAttachmentKind } from "@/server/security/uploads";

export type MessageAttachmentReference = {
  mediaFileId: string;
  kind: MessageAttachmentKind;
  fileName: string;
  mimeType: string;
  size: number;
};

export type OutboundMessageAttachment = MessageAttachmentReference & { filePath: string };

function mediaRoot() {
  return path.resolve(
    /* turbopackIgnore: true */
    process.env.MEDIA_STORAGE_DIR || path.join(process.cwd(), "data", "media"),
  );
}

function storagePath(storageKey: string) {
  const root = mediaRoot();
  const target = path.resolve(root, storageKey);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("MEDIA_STORAGE_KEY_INVALID");
  return target;
}

function kindFromMimeType(mimeType: string): MessageAttachmentKind {
  if (mimeType.startsWith("image/")) return "PHOTO";
  if (mimeType.startsWith("video/")) return "VIDEO";
  return "DOCUMENT";
}

export function mediaFileReference(file: Pick<MediaFile, "id" | "fileName" | "mimeType" | "size">): MessageAttachmentReference {
  return { mediaFileId: file.id, kind: kindFromMimeType(file.mimeType), fileName: file.fileName, mimeType: file.mimeType, size: file.size };
}

export function readMessageAttachmentReference(contentJson: unknown): MessageAttachmentReference | null {
  return readMessageAttachmentReferences(contentJson)[0] ?? null;
}

function parseAttachmentReference(value: unknown): MessageAttachmentReference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.mediaFileId !== "string" || !item.mediaFileId) return null;
  if (!(["PHOTO", "VIDEO", "DOCUMENT"] as const).includes(item.kind as MessageAttachmentKind)) return null;
  if (typeof item.fileName !== "string" || typeof item.mimeType !== "string" || typeof item.size !== "number") return null;
  return { mediaFileId: item.mediaFileId, kind: item.kind as MessageAttachmentKind, fileName: item.fileName, mimeType: item.mimeType, size: item.size };
}

export function readMessageAttachmentReferences(contentJson: unknown): MessageAttachmentReference[] {
  const metadata = readCampaignMetadata(contentJson);
  const values = Array.isArray(metadata.attachments) ? metadata.attachments : metadata.attachment ? [metadata.attachment] : [];
  const seen = new Set<string>();
  const attachments: MessageAttachmentReference[] = [];
  for (const value of values) {
    const attachment = parseAttachmentReference(value);
    if (!attachment || seen.has(attachment.mediaFileId)) continue;
    seen.add(attachment.mediaFileId);
    attachments.push(attachment);
  }
  return attachments;
}

export async function persistMediaBytes(storageKey: string, data: Buffer) {
  const target = storagePath(storageKey);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(temporary, data, { flag: "wx", mode: 0o600 });
  await rename(temporary, target).catch(async (error) => {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  });
}

export async function persistMediaStream(input: {
  storageKey: string;
  body: ReadableStream<Uint8Array>;
  expectedSize: number;
  sampleBytes: number;
  validateSample: (sample: Buffer) => void;
}) {
  const target = storagePath(input.storageKey);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(path.dirname(target), { recursive: true });
  let size = 0;
  let sampleLength = 0;
  const sampleChunks: Buffer[] = [];
  const checksum = createHash("sha256");
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > input.expectedSize) {
        callback(new Error("UPLOAD_FILE_SIZE_MISMATCH"));
        return;
      }
      checksum.update(chunk);
      if (sampleLength < input.sampleBytes) {
        const remaining = input.sampleBytes - sampleLength;
        const slice = chunk.subarray(0, Math.min(chunk.length, remaining));
        sampleChunks.push(slice);
        sampleLength += slice.length;
      }
      callback(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(input.body as Parameters<typeof Readable.fromWeb>[0]),
      meter,
      createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
    );
    if (size !== input.expectedSize) throw new Error("UPLOAD_FILE_SIZE_MISMATCH");
    input.validateSample(Buffer.concat(sampleChunks, sampleLength));
    await rename(temporary, target);
    return { size, checksum: checksum.digest("hex") };
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function deleteMediaBytes(storageKey: string) {
  await rm(storagePath(storageKey), { force: true });
}

export async function resolveOwnedMediaFile(mediaFileId: string, companyId: string, userId: string) {
  const file = await prisma.mediaFile.findFirst({ where: { id: mediaFileId, companyId, uploadedById: userId } });
  if (!file) throw new Error("MEDIA_FILE_NOT_FOUND");
  return file;
}

export async function resolveOwnedMediaFiles(mediaFileIds: string[], companyId: string, userId: string) {
  const ids = [...new Set(mediaFileIds)];
  if (!ids.length) return [];
  const files = await prisma.mediaFile.findMany({ where: { id: { in: ids }, companyId, uploadedById: userId } });
  const byId = new Map(files.map((file) => [file.id, file]));
  return ids.map((id) => {
    const file = byId.get(id);
    if (!file) throw new Error("MEDIA_FILE_NOT_FOUND");
    return file;
  });
}

export async function loadOutboundMessageAttachment(input: { contentJson: unknown; companyId: string; userId: string }): Promise<OutboundMessageAttachment | null> {
  return (await loadOutboundMessageAttachments(input))[0] ?? null;
}

export async function loadOutboundMessageAttachments(input: { contentJson: unknown; companyId: string; userId: string }): Promise<OutboundMessageAttachment[]> {
  const references = readMessageAttachmentReferences(input.contentJson);
  if (!references.length) return [];
  const files = await resolveOwnedMediaFiles(references.map((reference) => reference.mediaFileId), input.companyId, input.userId);
  const byId = new Map(files.map((file) => [file.id, file]));
  return Promise.all(references.map(async (reference) => {
    const file = byId.get(reference.mediaFileId);
    if (!file) throw new Error("MEDIA_FILE_NOT_FOUND");
    if (file.size !== reference.size || file.fileName !== reference.fileName || file.mimeType !== reference.mimeType) throw new Error("MEDIA_FILE_METADATA_MISMATCH");
    const filePath = storagePath(file.storageKey);
    const details = await stat(/* turbopackIgnore: true */ filePath);
    if (!details.isFile() || details.size !== file.size) throw new Error("MEDIA_FILE_SIZE_MISMATCH");
    return { ...mediaFileReference(file), filePath };
  }));
}
