export type ProviderContactRecord = {
  id: string;
  jid?: string | null;
  phoneNumber?: string | null;
  name?: string | null;
  notify?: string | null;
  verifiedName?: string | null;
};

export type WhatsAppContactDisplayNameSource =
  | "SAVED_NAME"
  | "NOTIFY"
  | "VERIFIED_NAME"
  | "PUSH_NAME"
  | "PHONE_FALLBACK";

type ContactDisplayFields = {
  phone: string;
  name?: string | null;
  pushName?: string | null;
  notifyName?: string | null;
  verifiedName?: string | null;
  displayName?: string | null;
  displayNameSource?: WhatsAppContactDisplayNameSource | null;
};

function usableDisplayName(value: string | null | undefined, phone: string) {
  const candidate = value?.trim();
  if (!candidate) return null;

  const lower = candidate.toLowerCase();
  if (lower === "null" || lower === "undefined") return null;
  if (lower.endsWith("@s.whatsapp.net") || lower.endsWith("@lid") || lower.endsWith("@g.us")) return null;

  const candidateDigits = candidate.replace(/\D/g, "");
  const phoneDigits = phone.replace(/\D/g, "");
  const phoneLike = /^[+\d\s().-]+$/.test(candidate);
  if (phoneLike && candidateDigits.length >= 7) return null;
  if (candidateDigits && candidateDigits === phoneDigits) return null;

  return candidate;
}

function phoneDisplayName(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `+${digits}` : phone.trim();
}

const DISPLAY_NAME_SOURCE_PRIORITY: Record<WhatsAppContactDisplayNameSource, number> = {
  SAVED_NAME: 50,
  NOTIFY: 40,
  VERIFIED_NAME: 30,
  PUSH_NAME: 20,
  PHONE_FALLBACK: 10,
};

export function resolveWhatsAppContactDisplayIdentity(contact: ContactDisplayFields): {
  displayName: string;
  displayNameSource: WhatsAppContactDisplayNameSource;
} {
  const candidates: Array<{ value: string | null; source: WhatsAppContactDisplayNameSource }> = [
    { value: usableDisplayName(contact.name, contact.phone), source: "SAVED_NAME" },
    { value: usableDisplayName(contact.notifyName, contact.phone), source: "NOTIFY" },
    { value: usableDisplayName(contact.verifiedName, contact.phone), source: "VERIFIED_NAME" },
    { value: usableDisplayName(contact.pushName, contact.phone), source: "PUSH_NAME" },
  ];

  if (contact.displayName) {
    const source = contact.displayNameSource && contact.displayNameSource !== "PHONE_FALLBACK"
      ? contact.displayNameSource
      : "SAVED_NAME";
    candidates.push({
      value: usableDisplayName(contact.displayName, contact.phone),
      source,
    });
  }

  const strongest = candidates
    .filter((candidate): candidate is { value: string; source: WhatsAppContactDisplayNameSource } => Boolean(candidate.value))
    .sort((left, right) => DISPLAY_NAME_SOURCE_PRIORITY[right.source] - DISPLAY_NAME_SOURCE_PRIORITY[left.source])[0];

  if (strongest) {
    return { displayName: strongest.value, displayNameSource: strongest.source };
  }
  return { displayName: phoneDisplayName(contact.phone), displayNameSource: "PHONE_FALLBACK" };
}

export function resolveWhatsAppContactDisplayName(contact: ContactDisplayFields) {
  return resolveWhatsAppContactDisplayIdentity(contact).displayName;
}

export function normalizeWhatsAppContactJid(value: string | null | undefined) {
  const candidate = value?.trim().toLowerCase();
  if (!candidate || candidate.endsWith("@g.us") || candidate.endsWith("@broadcast") || candidate === "status@broadcast") return null;
  if (candidate.endsWith("@lid")) {
    const lid = candidate.slice(0, -"@lid".length).replace(/:\d+$/, "").replace(/\D/g, "");
    return lid.length >= 5 ? { jid: `${lid}@lid`, phone: "", addressType: "LID" as const } : null;
  }
  if (candidate.endsWith("@s.whatsapp.net")) {
    const phone = candidate.slice(0, -"@s.whatsapp.net".length).replace(/\D/g, "");
    return phone.length >= 7 ? { jid: `${phone}@s.whatsapp.net`, phone, addressType: "PN" as const } : null;
  }
  if (/^\+?\d{7,20}$/.test(candidate)) {
    const phone = candidate.replace(/\D/g, "");
    return { jid: `${phone}@s.whatsapp.net`, phone, addressType: "PN" as const };
  }
  return null;
}

export function normalizeProviderContact(contact: ProviderContactRecord) {
  const normalized = normalizeWhatsAppContactJid(contact.phoneNumber || contact.jid || contact.id);
  if (!normalized) return null;
  const name = usableDisplayName(contact.name, normalized.phone);
  const notifyName = usableDisplayName(contact.notify, normalized.phone);
  const verifiedName = usableDisplayName(contact.verifiedName, normalized.phone);
  const pushName = notifyName || verifiedName;
  if (normalized.addressType === "LID" && !name && !notifyName && !verifiedName) return null;
  const identity = resolveWhatsAppContactDisplayIdentity({
    phone: normalized.phone,
    name,
    notifyName,
    verifiedName,
    pushName,
  });
  return {
    externalContactId: normalized.jid,
    phone: normalized.phone,
    name,
    pushName,
    notifyName,
    verifiedName,
    ...identity,
  };
}
