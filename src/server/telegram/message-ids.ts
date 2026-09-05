const MULTI_MESSAGE_ID_PREFIX = "multi:v1:";

export function encodeTelegramExternalMessageIds(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return null;
  if (unique.length === 1) return unique[0];
  return `${MULTI_MESSAGE_ID_PREFIX}${JSON.stringify(unique)}`;
}

export function decodeTelegramExternalMessageIds(value: string | null | undefined) {
  if (!value) return [];
  if (!value.startsWith(MULTI_MESSAGE_ID_PREFIX)) return [value];
  try {
    const parsed = JSON.parse(value.slice(MULTI_MESSAGE_ID_PREFIX.length));
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((id): id is string => typeof id === "string" && Boolean(id)))]
      : [];
  } catch {
    return [];
  }
}
