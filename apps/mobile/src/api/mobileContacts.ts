import { apiClient } from "@/api/client";

export type MobileWhatsAppContact = {
  id: string;
  accountId: string;
  externalContactId: string;
  phone: string;
  name: string | null;
  pushName: string | null;
  notifyName: string | null;
  verifiedName: string | null;
  displayName: string;
  displayNameSource: "SAVED_NAME" | "NOTIFY" | "VERIFIED_NAME" | "PUSH_NAME" | "PHONE_FALLBACK";
  isWhatsAppUser: boolean;
  isActive: boolean;
  lastSeenAt: string | null;
  updatedAt: string;
};

export type MobileContactsResponse = {
  account: { id: string; phoneNumber: string | null; lastContactSyncAt: string | null };
  contacts: MobileWhatsAppContact[];
  syncRun: null | {
    id: string;
    status: "QUEUED" | "RUNNING" | "PARTIAL" | "COMPLETED" | "FAILED" | "CANCELLED";
    persistedCount: number;
    namedCount: number;
    fallbackCount: number;
    errorCode: string | null;
  };
  pageInfo: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
};

export function getMobileContactDisplayName(contact: Pick<MobileWhatsAppContact, "phone" | "name" | "pushName"> & Partial<Pick<MobileWhatsAppContact, "displayName">>) {
  for (const value of [contact.displayName, contact.name, contact.pushName]) {
    const candidate = value?.trim();
    if (!candidate) continue;
    const lower = candidate.toLowerCase();
    if (lower.endsWith("@s.whatsapp.net") || lower.endsWith("@lid") || lower.endsWith("@g.us")) continue;
    const candidateDigits = candidate.replace(/\D/g, "");
    if (/^[+\d\s().-]+$/.test(candidate) && candidateDigits.length >= 7) continue;
    if (candidateDigits && candidateDigits === contact.phone.replace(/\D/g, "")) continue;
    return candidate;
  }
  const digits = contact.phone.replace(/\D/g, "");
  return digits ? `+${digits}` : contact.phone;
}

export function getMobileContacts(params: { page?: number; limit?: number; search?: string } = {}) {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  query.set("limit", String(params.limit ?? 100));
  if (params.search?.trim()) query.set("search", params.search.trim());
  return apiClient.request<MobileContactsResponse>(`/api/mobile/whatsapp/contacts?${query.toString()}`);
}

export function syncMobileContacts(accountId?: string) {
  return apiClient.post<{ queued: boolean; accountId: string; jobId: string; syncRunId: string; status: string }>("/api/mobile/whatsapp/contacts/sync-current", { accountId });
}
