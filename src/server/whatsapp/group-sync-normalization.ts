export type RuntimeWhatsAppGroupMetadata = {
  id?: string | null;
  subject?: string | null;
  desc?: string | null;
  participants?: readonly unknown[] | null;
  size?: number | null;
  announce?: boolean | null;
};

export type NormalizedWhatsAppGroup = {
  externalId: string;
  name: string;
  description?: string;
  participantCount: number;
  canSend: boolean;
  nameSource: "FETCH_ALL" | "DIRECT_METADATA" | "EXISTING" | "FALLBACK";
};

function cleanText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function isWhatsAppGroupId(value: string | null | undefined) {
  return Boolean(value?.trim().endsWith("@g.us"));
}

export function fallbackWhatsAppGroupName(externalId: string) {
  const stableSuffix = externalId.split("@")[0]?.slice(-8) || "group";
  return `WhatsApp · ${stableSuffix}`;
}

export function normalizeWhatsAppGroupMetadata(
  primary: RuntimeWhatsAppGroupMetadata,
  options: {
    detailed?: RuntimeWhatsAppGroupMetadata | null;
    existingName?: string | null;
  } = {},
): NormalizedWhatsAppGroup | null {
  const externalId = cleanText(options.detailed?.id) ?? cleanText(primary.id);
  if (!externalId || !isWhatsAppGroupId(externalId)) return null;

  const directName = cleanText(options.detailed?.subject);
  const fetchedName = cleanText(primary.subject);
  const existingName = cleanText(options.existingName);
  const name = directName ?? fetchedName ?? existingName ?? fallbackWhatsAppGroupName(externalId);
  const nameSource = directName
    ? "DIRECT_METADATA"
    : fetchedName
      ? "FETCH_ALL"
      : existingName
        ? "EXISTING"
        : "FALLBACK";
  const participants = Array.isArray(options.detailed?.participants)
    ? options.detailed.participants
    : Array.isArray(primary.participants)
      ? primary.participants
      : [];
  const reportedSize = Number(options.detailed?.size ?? primary.size ?? 0);
  const participantCount = Math.max(
    participants.length,
    Number.isFinite(reportedSize) && reportedSize > 0 ? Math.floor(reportedSize) : 0,
  );

  return {
    externalId,
    name,
    description: cleanText(options.detailed?.desc) ?? cleanText(primary.desc),
    participantCount,
    canSend: !(options.detailed?.announce ?? primary.announce ?? false),
    nameSource,
  };
}
