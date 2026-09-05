/** Bound UTF-16 length without splitting emoji, and keep derived text valid for PostgreSQL.
 * The encrypted original is retained separately by ingestion. */
export function boundedDatabaseText(value: string, maxUnits: number) {
  if (!Number.isSafeInteger(maxUnits) || maxUnits < 0) throw new RangeError("INVALID_TEXT_LIMIT");
  let result = value.slice(0, maxUnits);
  const last = result.charCodeAt(result.length - 1);
  const next = value.charCodeAt(result.length);
  if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) result = result.slice(0, -1);
  return result.toWellFormed().replace(/\0/g, "\uFFFD");
}
