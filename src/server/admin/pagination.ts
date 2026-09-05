import "server-only";

export const ADMIN_TABLE_PAGE_SIZE = 50;

export function normalizeAdminPage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function adminPageCount(
  total: number,
  pageSize = ADMIN_TABLE_PAGE_SIZE,
) {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}
