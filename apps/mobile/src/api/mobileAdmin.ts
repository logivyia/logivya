import { apiClient } from "@/api/client";

export type AdminModuleKey =
  | "dashboard"
  | "companies"
  | "users"
  | "roles"
  | "billing"
  | "subscriptions"
  | "invoices"
  | "payments"
  | "whatsappAccounts"
  | "campaigns"
  | "support"
  | "security"
  | "compliance"
  | "audit"
  | "activity"
  | "notifications"
  | "dataRequests"
  | "metrics"
  | "systemHealth"
  | "backups"
  | "disasterRecovery"
  | "settings"
  | "featureFlags"
  | "announcements"
  | "apiUsage"
  | "webhooks"
  | "platformSettings";

export type AdminModuleDefinition = {
  key: AdminModuleKey;
  title: string;
  eyebrow: string;
  description: string;
  endpoint?: string;
  coverage: "live" | "summary";
};

export type AdminSupportMessage = {
  id: string;
  senderType: string;
  message: string;
  isInternal?: boolean;
  createdAt: string;
  senderUser?: { name: string | null; email: string } | null;
};

export type AdminSupportTicket = {
  id: string;
  publicId: string;
  subject: string;
  title?: string;
  type: string;
  category?: string;
  status: string;
  priority?: string;
  createdAt: string;
  updatedAt?: string;
  lastMessageAt?: string | null;
  closedAt?: string | null;
  adminUnreadCount?: number;
  unreadReplyCount?: number;
  company?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string | null; email: string } | null;
  messages?: AdminSupportMessage[];
};

export const adminModuleDefinitions: Record<AdminModuleKey, AdminModuleDefinition> = {
  dashboard: {
    key: "dashboard",
    title: "Yonetici Paneli",
    eyebrow: "Yonetici",
    description: "Web yonetici panelindeki operasyon, abonelik ve platform ozeti.",
    endpoint: "/api/admin/dashboard",
    coverage: "live"
  },
  companies: {
    key: "companies",
    title: "Sirketler",
    eyebrow: "Yonetici",
    description: "Platform sirketleri, sahipleri ve abonelik durumlari.",
    endpoint: "/api/admin/companies",
    coverage: "live"
  },
  users: {
    key: "users",
    title: "Kullanicilar",
    eyebrow: "Ekip Erisimi",
    description: "Kullanici, oturum, cihaz ve rol yonetimi.",
    endpoint: "/api/admin/users",
    coverage: "live"
  },
  roles: {
    key: "roles",
    title: "Roller",
    eyebrow: "Erisim",
    description: "Owner, admin, manager, operator ve support rollerinin operasyon ozeti.",
    endpoint: "/api/admin/users",
    coverage: "summary"
  },
  billing: {
    key: "billing",
    title: "Faturalandirma",
    eyebrow: "Finans",
    description: "Fatura, odeme ve abonelik akislarinin birlesik gorunumu.",
    endpoint: "/api/admin/dashboard",
    coverage: "summary"
  },
  subscriptions: {
    key: "subscriptions",
    title: "Abonelikler",
    eyebrow: "Finans",
    description: "Abonelik durumlari ve manuel aktivasyonlar.",
    endpoint: "/api/admin/subscriptions",
    coverage: "live"
  },
  invoices: {
    key: "invoices",
    title: "Faturalar",
    eyebrow: "Finans",
    description: "Fatura kayitlari ve durumlari.",
    endpoint: "/api/admin/invoices",
    coverage: "live"
  },
  payments: {
    key: "payments",
    title: "Odemeler",
    eyebrow: "Finans",
    description: "Odeme kayitlari, onay ve reddetme akislarinin ozeti.",
    endpoint: "/api/admin/payments",
    coverage: "live"
  },
  whatsappAccounts: {
    key: "whatsappAccounts",
    title: "WhatsApp Hesaplari",
    eyebrow: "WhatsApp",
    description: "Bagli hesaplar, oturumlar ve baglanti sagligi.",
    endpoint: "/api/admin/dashboard",
    coverage: "summary"
  },
  campaigns: {
    key: "campaigns",
    title: "Kampanyalar",
    eyebrow: "WhatsApp",
    description: "Kampanya ve mesaj operasyonlarinin yonetici ozeti.",
    endpoint: "/api/admin/dashboard",
    coverage: "summary"
  },
  support: {
    key: "support",
    title: "Destek",
    eyebrow: "Operasyon",
    description: "Platform destek talepleri.",
    endpoint: "/api/admin/support/tickets",
    coverage: "live"
  },
  security: {
    key: "security",
    title: "Guvenlik",
    eyebrow: "Guvenlik",
    description: "Guvenlik olaylari ve erisim denetimi.",
    endpoint: "/api/admin/security/events",
    coverage: "live"
  },
  compliance: {
    key: "compliance",
    title: "Uyumluluk",
    eyebrow: "Guvenlik",
    description: "KVKK, izinler ve veri sahibi sureclerinin izlenmesi.",
    endpoint: "/api/admin/dashboard",
    coverage: "summary"
  },
  audit: {
    key: "audit",
    title: "Denetim Merkezi",
    eyebrow: "Izlenebilirlik",
    description: "Audit kayitlari ve sistem izleri.",
    endpoint: "/api/admin/activity",
    coverage: "summary"
  },
  activity: {
    key: "activity",
    title: "Aktivite Merkezi",
    eyebrow: "Izlenebilirlik",
    description: "Platform aktivite akisi.",
    endpoint: "/api/admin/activity",
    coverage: "live"
  },
  notifications: {
    key: "notifications",
    title: "Bildirimler",
    eyebrow: "Operasyon",
    description: "Yonetici bildirimleri ve okunma durumu.",
    endpoint: "/api/admin/activity",
    coverage: "summary"
  },
  dataRequests: {
    key: "dataRequests",
    title: "Veri Talepleri",
    eyebrow: "Uyumluluk",
    description: "Erisim, disa aktarma ve silme taleplerinin operasyon takibi.",
    endpoint: "/api/admin/activity",
    coverage: "summary"
  },
  metrics: {
    key: "metrics",
    title: "Metrikler",
    eyebrow: "Raporlama",
    description: "Platform metrikleri ve kullanim gostergeleri.",
    endpoint: "/api/admin/metrics",
    coverage: "live"
  },
  systemHealth: {
    key: "systemHealth",
    title: "Sistem Sagligi",
    eyebrow: "Altyapi",
    description: "API, Redis, worker ve WhatsApp saglik kontrolleri.",
    endpoint: "/api/admin/system/health",
    coverage: "live"
  },
  backups: {
    key: "backups",
    title: "Yedekler",
    eyebrow: "Altyapi",
    description: "Yedekleme ve geri yukleme operasyonlarinin izlenmesi.",
    endpoint: "/api/admin/system/health",
    coverage: "summary"
  },
  disasterRecovery: {
    key: "disasterRecovery",
    title: "Felaket Kurtarma",
    eyebrow: "Altyapi",
    description: "Kurtarma plani ve operasyonel sureklilik sinyalleri.",
    endpoint: "/api/admin/system/health",
    coverage: "summary"
  },
  settings: {
    key: "settings",
    title: "Ayarlar",
    eyebrow: "Platform",
    description: "Yonetici ayarlari ve operasyonel yapilandirma.",
    endpoint: "/api/admin/dashboard",
    coverage: "summary"
  },
  featureFlags: {
    key: "featureFlags",
    title: "Ozellik Bayraklari",
    eyebrow: "Platform",
    description: "Aktif/pasif platform ozelliklerinin operasyon ozeti.",
    endpoint: "/api/admin/dashboard",
    coverage: "summary"
  },
  announcements: {
    key: "announcements",
    title: "Duyurular",
    eyebrow: "Platform",
    description: "Kullanici duyurulari ve platform mesajlari.",
    endpoint: "/api/admin/activity",
    coverage: "summary"
  },
  apiUsage: {
    key: "apiUsage",
    title: "API Kullanimi",
    eyebrow: "Platform",
    description: "API kullanimi, entegrasyon ve sistem sinyalleri.",
    endpoint: "/api/admin/metrics",
    coverage: "summary"
  },
  webhooks: {
    key: "webhooks",
    title: "Webhooklar",
    eyebrow: "Platform",
    description: "Webhook ve entegrasyon akisi.",
    endpoint: "/api/admin/activity",
    coverage: "summary"
  },
  platformSettings: {
    key: "platformSettings",
    title: "Platform Ayarlari",
    eyebrow: "Platform",
    description: "Genel platform yapilandirmasi ve sistem sinyalleri.",
    endpoint: "/api/admin/system/health",
    coverage: "summary"
  }
};

export function getAdminModuleDefinition(key: AdminModuleKey) {
  return adminModuleDefinitions[key];
}

export function getAdminModuleData(definition: AdminModuleDefinition) {
  if (!definition.endpoint) {
    return Promise.resolve({ status: "NO_ENDPOINT" });
  }
  return apiClient.requestRaw<Record<string, unknown>>(definition.endpoint);
}

export function getAdminSupportTickets(params?: { cursor?: string; search?: string; status?: string; priority?: string; unreadOnly?: boolean }) {
  const query = new URLSearchParams({ limit: "30" });
  if (params?.cursor) query.set("cursor", params.cursor);
  if (params?.search) query.set("search", params.search);
  if (params?.status) query.set("status", params.status);
  if (params?.priority) query.set("priority", params.priority);
  if (params?.unreadOnly) query.set("unread", "true");
  return apiClient.requestRaw<{
    tickets: AdminSupportTicket[];
    pageInfo: { nextCursor: string | null; hasMore: boolean };
    metrics?: Record<string, number>;
  }>(`/api/admin/support/tickets?${query}`);
}

export function getAdminSupportTicket(id: string, cursor?: string) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=50` : "?limit=50";
  return apiClient.requestRaw<{
    ticket: AdminSupportTicket;
    messages: AdminSupportMessage[];
    pageInfo: { nextCursor: string | null; hasMore: boolean };
  }>(`/api/admin/support/tickets/${id}${query}`);
}

export function replyAdminSupportTicket(id: string, input: { message: string; clientMessageId: string; internalNote?: boolean }) {
  return apiClient.requestRaw<{ message: AdminSupportMessage; ticket: Pick<AdminSupportTicket, "id" | "status" | "lastMessageAt"> }>(
    `/api/admin/support/tickets/${id}/messages`,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
}

export function updateAdminSupportTicketPriority(id: string, priority: string) {
  return apiClient.requestRaw<{ ticket: Pick<AdminSupportTicket, "id" | "priority"> }>(`/api/admin/support/tickets/${id}/priority`, {
    method: "PATCH",
    body: JSON.stringify({ priority })
  });
}

export function updateAdminSupportTicketStatus(id: string, status: string) {
  return apiClient.requestRaw<{ ticket: Pick<AdminSupportTicket, "id" | "status"> }>(`/api/admin/support/tickets/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}
