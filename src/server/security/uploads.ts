import { randomUUID } from "node:crypto";
import { extname } from "node:path";

const ALLOWED = new Map([
  [".jpg", ["image/jpeg"]], [".jpeg", ["image/jpeg"]], [".png", ["image/png"]], [".webp", ["image/webp"]],
  [".pdf", ["application/pdf"]], [".doc", ["application/msword"]], [".docx", ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]],
  [".xls", ["application/vnd.ms-excel"]], [".xlsx", ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]], [".mp4", ["video/mp4"]],
]);
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export function validateUpload(input: { companyId: string; fileName: string; mimeType: string; size: number }) {
  if (!input.companyId) throw new Error("Upload company is required");
  if (input.size <= 0 || input.size > MAX_UPLOAD_BYTES) throw new Error("File size is not allowed");
  const extension = extname(input.fileName).toLowerCase();
  if (!ALLOWED.get(extension)?.includes(input.mimeType)) throw new Error("File type is not allowed");
  return { storageKey: `${input.companyId}/${randomUUID()}${extension}`, requiresVirusScan: true };
}
