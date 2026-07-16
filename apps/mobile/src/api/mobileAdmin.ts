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
  | "trialRisk"
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
  endpoint: string;
  coverage: "live" | "read-only";
  searchable?: boolean;
  statusOptions?: string[];
  pagination?: "page" | "cursor" | "none";
};

export type AdminModuleItem = {
  id: string;
  title: string;
  subtitle?: string | null | undefined;
  status?: string | null | undefined;
  createdAt?: string | null | undefined;
  updatedAt?: string | null | undefined;
  fields: Record<string, string | number | boolean | null>;
  actions?: string[];
};

export type AdminModuleViewData = {
  generatedAt: string;
  metrics: Record<string, string | number | boolean | null>;
  items: AdminModuleItem[];
  pagination: { page: number; limit: number; total: number; pages: number; nextPage: number | null };
  capabilities: { search: boolean; filters: string[]; actions: string[]; readOnly: boolean; readOnlyReason?: string };
};

export type AdminModuleQuery = {
  page?: number;
  search?: string;
  status?: string;
};

export type AdminCompanyOption = { id: string; name: string; email?: string | undefined };

export type ManualAdminSubscriptionInput = {
  companyId: string;
  planSlug: "starter" | "professional";
  billingPeriod: "MONTHLY" | "YEARLY";
  startsAt: string;
  endsAt: string;
  currency: "TRY";
  paymentMethod: "MANUAL_BANK_TRANSFER" | "MANUAL" | "FREE_PROMO" | "OTHER";
  note: string;
};

export type AdminSupportMessage = {
  id: string;
  senderType: string;
  message: string;
  isInternal?: boolean;
  attachmentUrl?: string | null;
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
  assignedToAdmin?: { id: string; name: string | null; email: string } | null;
  messages?: AdminSupportMessage[];
};

export const adminModuleDefinitions: Record<AdminModuleKey, AdminModuleDefinition> = {
  dashboard: {
    key: "dashboard",
    title: "Yonetici Paneli",
    eyebrow: "Yonetici",
    description: "Web yonetici panelindeki operasyon, abonelik ve platform ozeti.",
    endpoint: "/api/admin/dashboard",
    coverage: "live",
    pagination: "none"
  },
  companies: {
    key: "companies",
    title: "Sirketler",
    eyebrow: "Yonetici",
    description: "Platform sirketleri, sahipleri ve abonelik durumlari.",
    endpoint: "/api/admin/companies",
    coverage: "live",
    searchable: true,
    statusOptions: ["ACTIVE", "UNDER_INVESTIGATION", "DISABLED"],
    pagination: "none"
  },
  users: {
    key: "users",
    title: "Kullanicilar",
    eyebrow: "Ekip Erisimi",
    description: "Kullanici, oturum, cihaz ve rol yonetimi.",
    endpoint: "/api/admin/users",
    coverage: "live",
    searchable: true,
    statusOptions: ["ACTIVE", "SUSPENDED", "INVITED"],
    pagination: "page"
  },
  roles: {
    key: "roles",
    title: "Roller",
    eyebrow: "Erisim",
    description: "Owner, admin, manager, operator ve support rollerinin operasyon ozeti.",
    endpoint: "/api/admin/users",
    coverage: "read-only",
    searchable: true,
    pagination: "page"
  },
  billing: {
    key: "billing",
    title: "Faturalandirma",
    eyebrow: "Finans",
    description: "Fatura, odeme ve abonelik akislarinin birlesik gorunumu.",
    endpoint: "/api/admin/modules/billing",
    coverage: "read-only",
    searchable: true,
    statusOptions: ["PENDING", "PAID", "SUCCEEDED", "FAILED", "REFUNDED"],
    pagination: "page"
  },
  subscriptions: {
    key: "subscriptions",
    title: "Abonelikler",
    eyebrow: "Finans",
    description: "Abonelik durumlari ve manuel aktivasyonlar.",
    endpoint: "/api/admin/subscriptions",
    coverage: "live",
    searchable: true,
    statusOptions: ["ACTIVE", "TRIALING", "EXPIRED", "CANCELED", "SUSPENDED", "MANUAL_PENDING"],
    pagination: "none"
  },
  invoices: {
    key: "invoices",
    title: "Faturalar",
    eyebrow: "Finans",
    description: "Fatura kayitlari ve durumlari.",
    endpoint: "/api/admin/invoices",
    coverage: "live",
    searchable: true,
    statusOptions: ["DRAFT", "ISSUED", "PAID", "CANCELED", "FAILED"],
    pagination: "page"
  },
  payments: {
    key: "payments",
    title: "Odemeler",
    eyebrow: "Finans",
    description: "Odeme kayitlari, onay ve reddetme akislarinin ozeti.",
    endpoint: "/api/admin/payments",
    coverage: "live",
    searchable: true,
    statusOptions: ["PENDING", "PAID", "SUCCEEDED", "FAILED", "REFUNDED"],
    pagination: "page"
  },
  whatsappAccounts: {
    key: "whatsappAccounts",
    title: "WhatsApp Hesaplari",
    eyebrow: "WhatsApp",
    description: "Bagli hesaplar, oturumlar ve baglanti sagligi.",
    endpoint: "/api/admin/modules/whatsapp-accounts",
    coverage: "read-only",
    searchable: true,
    statusOptions: ["CONNECTED", "CONNECTING", "DISCONNECTED", "RECONNECT_REQUIRED", "FAILED", "ARCHIVED"],
    pagination: "page"
  },
  campaigns: {
    key: "campaigns",
    title: "Kampanyalar",
    eyebrow: "WhatsApp",
    description: "Kampanya ve mesaj operasyonlarinin yonetici ozeti.",
    endpoint: "/api/admin/modules/campaigns",
    coverage: "read-only",
    searchable: true,
    statusOptions: ["QUEUED", "SCHEDULED", "SENDING", "COMPLETED", "FAILED", "CANCELED"],
    pagination: "page"
  },
  support: {
    key: "support",
    title: "Destek",
    eyebrow: "Operasyon",
    description: "Platform destek talepleri.",
    endpoint: "/api/admin/support/tickets",
    coverage: "live",
    searchable: true,
    pagination: "cursor"
  },
  security: {
    key: "security",
    title: "Guvenlik",
    eyebrow: "Guvenlik",
    description: "Guvenlik olaylari ve erisim denetimi.",
    endpoint: "/api/admin/security/events",
    coverage: "live",
    searchable: true,
    statusOptions: ["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED", "CRITICAL", "HIGH", "MEDIUM", "LOW"],
    pagination: "page"
  },
  trialRisk: {
    key: "trialRisk",
    title: "Deneme Riski",
    eyebrow: "Guvenlik",
    description: "Deneme uygunlugu, kimlik tekrar kullanimi ve manuel inceleme kararlari.",
    endpoint: "/api/admin/trial-entitlements",
    coverage: "live",
    statusOptions: ["PENDING_IDENTITY", "ACTIVE", "CONSUMED", "INELIGIBLE", "BLOCKED", "PAID_USAGE"],
    pagination: "page"
  },
  compliance: {
    key: "compliance",
    title: "Uyumluluk",
    eyebrow: "Guvenlik",
    description: "KVKK, izinler ve veri sahibi sureclerinin izlenmesi.",
    endpoint: "/api/admin/modules/compliance",
    coverage: "read-only",
    searchable: true,
    pagination: "page"
  },
  audit: {
    key: "audit",
    title: "Denetim Merkezi",
    eyebrow: "Izlenebilirlik",
    description: "Audit kayitlari ve sistem izleri.",
    endpoint: "/api/admin/modules/audit",
    coverage: "read-only",
    searchable: true,
    pagination: "page"
  },
  activity: {
    key: "activity",
    title: "Aktivite Merkezi",
    eyebrow: "Izlenebilirlik",
    description: "Platform aktivite akisi.",
    endpoint: "/api/admin/activity",
    coverage: "read-only",
    pagination: "page"
  },
  notifications: {
    key: "notifications",
    title: "Bildirimler",
    eyebrow: "Operasyon",
    description: "Yonetici bildirimleri ve okunma durumu.",
    endpoint: "/api/admin/modules/notifications",
    coverage: "read-only",
    searchable: true,
    statusOptions: ["READ", "UNREAD"],
    pagination: "page"
  },
  dataRequests: {
    key: "dataRequests",
    title: "Veri Talepleri",
    eyebrow: "Uyumluluk",
    description: "Erisim, disa aktarma ve silme taleplerinin operasyon takibi.",
    endpoint: "/api/admin/modules/data-requests",
    coverage: "read-only",
    searchable: true,
    statusOptions: ["REQUESTED", "VERIFYING", "PROCESSING", "COMPLETED", "REJECTED"],
    pagination: "page"
  },
  metrics: {
    key: "metrics",
    title: "Metrikler",
    eyebrow: "Raporlama",
    description: "Platform metrikleri ve kullanim gostergeleri.",
    endpoint: "/api/admin/metrics",
    coverage: "read-only",
    pagination: "none"
  },
  systemHealth: {
    key: "systemHealth",
    title: "Sistem Sagligi",
    eyebrow: "Altyapi",
    description: "API, Redis, worker ve WhatsApp saglik kontrolleri.",
    endpoint: "/api/admin/system/health",
    coverage: "live",
    pagination: "none"
  },
  backups: {
    key: "backups",
    title: "Yedekler",
    eyebrow: "Altyapi",
    description: "Yedekleme ve geri yukleme operasyonlarinin izlenmesi.",
    endpoint: "/api/admin/modules/backups",
    coverage: "read-only",
    pagination: "none"
  },
  disasterRecovery: {
    key: "disasterRecovery",
    title: "Felaket Kurtarma",
    eyebrow: "Altyapi",
    description: "Kurtarma plani ve operasyonel sureklilik sinyalleri.",
    endpoint: "/api/admin/modules/disaster-recovery",
    coverage: "read-only",
    pagination: "none"
  },
  settings: {
    key: "settings",
    title: "Ayarlar",
    eyebrow: "Platform",
    description: "Yonetici ayarlari ve operasyonel yapilandirma.",
    endpoint: "/api/admin/modules/settings",
    coverage: "read-only",
    pagination: "none"
  },
  featureFlags: {
    key: "featureFlags",
    title: "Ozellik Bayraklari",
    eyebrow: "Platform",
    description: "Aktif/pasif platform ozelliklerinin operasyon ozeti.",
    endpoint: "/api/admin/modules/feature-flags",
    coverage: "read-only",
    searchable: true,
    pagination: "page"
  },
  announcements: {
    key: "announcements",
    title: "Duyurular",
    eyebrow: "Platform",
    description: "Kullanici duyurulari ve platform mesajlari.",
    endpoint: "/api/admin/modules/announcements",
    coverage: "read-only",
    searchable: true,
    statusOptions: ["ACTIVE", "INACTIVE"],
    pagination: "page"
  },
  apiUsage: {
    key: "apiUsage",
    title: "API Kullanimi",
    eyebrow: "Platform",
    description: "API kullanimi, entegrasyon ve sistem sinyalleri.",
    endpoint: "/api/admin/modules/api-usage",
    coverage: "read-only",
    searchable: true,
    pagination: "page"
  },
  webhooks: {
    key: "webhooks",
    title: "Webhooklar",
    eyebrow: "Platform",
    description: "Webhook ve entegrasyon akisi.",
    endpoint: "/api/admin/modules/webhooks",
    coverage: "read-only",
    searchable: true,
    statusOptions: ["ACTIVE", "INACTIVE"],
    pagination: "page"
  },
  platformSettings: {
    key: "platformSettings",
    title: "Platform Ayarlari",
    eyebrow: "Platform",
    description: "Genel platform yapilandirmasi ve sistem sinyalleri.",
    endpoint: "/api/admin/modules/platform-settings",
    coverage: "read-only",
    pagination: "none"
  }
};

export function getAdminModuleDefinition(key: AdminModuleKey) {
  return adminModuleDefinitions[key];
}

export async function getAdminModuleData(definition: AdminModuleDefinition, query?: AdminModuleQuery): Promise<AdminModuleViewData> {
  const params = new URLSearchParams();
  if (query?.page && query.page > 1) params.set("page", String(query.page));
  if (query?.search?.trim()) params.set("q", query.search.trim());
  if (query?.status && query.status !== "ALL") params.set("status", query.status);
  const endpoint = `${definition.endpoint}${params.size ? `?${params}` : ""}`;
  const raw = await apiClient.requestRaw<Record<string, unknown>>(endpoint);
  if (definition.endpoint.startsWith("/api/admin/modules/")) return raw as AdminModuleViewData;
  return adaptLegacyAdminResponse(definition, raw, query?.page ?? 1);
}

export function runAdminCompanyAction(id: string, action: "suspend" | "reactivate", reason: string) {
  return apiClient.requestRaw<{ company: Record<string, unknown> }>(`/api/admin/companies/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
}

export function runAdminUserAction(id: string, action: "SUSPEND" | "REACTIVATE" | "FORCE_LOGOUT" | "RESET_MFA" | "REQUIRE_MFA", reason: string) {
  return apiClient.requestRaw<{ ok: true }>(`/api/admin/users/${id}/action`, {
    method: "POST",
    body: JSON.stringify({ action, reason })
  });
}

export function runAdminSubscriptionAction(id: string, action: "ACTIVATE" | "SUSPEND" | "CANCEL", reason: string) {
  return apiClient.requestRaw<{ ok: true; subscription?: Record<string, unknown> }>(`/api/admin/subscriptions/${id}/action`, {
    method: "POST",
    body: JSON.stringify({ action, reason })
  });
}

export function reactivateAdminSubscription(id: string) {
  return apiClient.requestRaw<{ ok: true }>(`/api/admin/subscriptions/${id}/reactivate`, { method: "POST" });
}

export function confirmAdminPayment(paymentId: string, note?: string) {
  return apiClient.requestRaw<Record<string, unknown>>("/api/admin/payments/mark-paid", {
    method: "POST",
    body: JSON.stringify({ paymentId, note })
  });
}

export function rejectAdminPayment(paymentId: string, reason: string) {
  return apiClient.requestRaw<Record<string, unknown>>("/api/admin/payments/reject", {
    method: "POST",
    body: JSON.stringify({ paymentId, reason })
  });
}

export function reauthenticatePlatformAdmin(password: string) {
  return apiClient.requestRaw<{ ok: true; requestId: string }>("/api/admin/security/re-auth", {
    method: "POST",
    body: JSON.stringify({ password })
  });
}

export function updateAdminSecurityEvent(id: string, status: "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED", investigationNote: string) {
  return apiClient.requestRaw<{ event: Record<string, unknown> }>(`/api/admin/security/events/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, investigationNote }),
  });
}

export function updateAdminIncident(id: string, status: "ACKNOWLEDGED" | "INVESTIGATING" | "MITIGATED" | "RESOLVED", note: string) {
  return apiClient.requestRaw<{ incident: Record<string, unknown> }>(`/api/admin/incidents/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, note }),
  });
}

export function runAdminTrialDecision(id: string, action: "APPROVE_REVIEW" | "BLOCK", reason: string) {
  return apiClient.requestRaw<{ entitlement: Record<string, unknown> }>(`/api/admin/trial-entitlements/${id}/decision`, {
    method: "POST",
    body: JSON.stringify({ action, reason }),
  });
}

export async function getAdminCompanyOptions(): Promise<AdminCompanyOption[]> {
  const raw = await apiClient.requestRaw<{ companies: Array<Record<string, unknown>> }>("/api/admin/companies");
  return records(raw.companies).map((company) => ({
    id: readText(company, "id") ?? "",
    name: readText(company, "name") ?? "-",
    ...(readText(company, "email") ? { email: readText(company, "email") } : {}),
  })).filter((company) => company.id);
}

export function activateAdminSubscriptionManually(input: ManualAdminSubscriptionInput) {
  return apiClient.requestRaw<Record<string, unknown>>("/api/admin/subscriptions/manual-activate", {
    method: "POST",
    headers: { "Idempotency-Key": `mobile-admin:${input.companyId}:${input.planSlug}:${input.startsAt}:${input.endsAt}` },
    body: JSON.stringify(input),
  });
}

function adaptLegacyAdminResponse(definition: AdminModuleDefinition, raw: Record<string, unknown>, requestedPage: number): AdminModuleViewData {
  const generatedAt = readText(raw, "generatedAt") ?? new Date().toISOString();
  let metrics = primitiveRecord(raw.metrics);
  let items: AdminModuleItem[] = [];

  if (definition.key === "dashboard") {
    items = [
      ...records(raw.securityEvents).map((item, index) => adminItem(item, `security-${index}`, ["message", "type"], ["severity", "status"], ["companyId"])),
      ...records(raw.tickets).map((item, index) => adminItem(item, `ticket-${index}`, ["title", "subject"], ["status", "priority"], ["category", "lastMessageAt"])),
      ...records(raw.billingEvents).map((item, index) => adminItem(item, `billing-${index}`, ["message", "type"], ["type", "status"], ["createdAt"])),
      ...records(raw.recentAdminActions).map((item, index) => adminItem(item, `admin-${index}`, ["permission", "path"], ["method"], ["path", "permission", "createdAt"])),
    ];
  } else if (definition.key === "companies") {
    const companies = records(raw.companies);
    items = companies.map((company, index) => {
      const owner = record(company.owner);
      const subscriptions = records(company.subscriptions);
      const subscription = subscriptions[0] ?? {};
      const plan = record(subscription.plan);
      const seatUsage = record(company.seatUsage);
      return {
        id: readText(company, "id") ?? `company-${index}`,
        title: readText(company, "name") ?? "-",
        subtitle: readText(owner, "email") ?? readText(company, "email"),
        status: readText(company, "securityStatus"),
        createdAt: readText(company, "createdAt"),
        updatedAt: readText(company, "updatedAt"),
        fields: compactFields({
          owner: readText(owner, "name"),
          ownerEmail: readText(owner, "email"),
          phone: readText(company, "phone"),
          plan: readText(plan, "name"),
          subscriptionStatus: readText(subscription, "status"),
          seatsUsed: readNumber(seatUsage, "used"),
          seatLimit: readNumber(seatUsage, "limit"),
          seatsAvailable: readNumber(seatUsage, "available"),
          members: readNumber(record(company._count), "members"),
          whatsappAccounts: readNumber(record(company._count), "accounts"),
          groups: readNumber(record(company._count), "groups"),
          contacts: readNumber(record(company._count), "contacts"),
          campaigns: readNumber(record(company._count), "campaigns"),
          payments: readNumber(record(company._count), "payments"),
          invoices: readNumber(record(company._count), "invoices"),
          supportTickets: readNumber(record(company._count), "supportTickets"),
          lastActivityAt: readText(company, "lastActivityAt"),
          createdAt: readText(company, "createdAt"),
        }),
      };
    });
    metrics = { companies: companies.length };
  } else if (definition.key === "users" || definition.key === "roles") {
    const users = records(raw.users);
    items = users.map((user, index) => {
      const membership = records(user.memberships)[0] ?? {};
      const company = record(membership.company);
      const session = records(user.sessions)[0] ?? {};
      const admin = record(user.platformAdmin);
      return {
        id: readText(user, "id") ?? `user-${index}`,
        title: readText(user, "name") ?? readText(user, "email") ?? "-",
        subtitle: readText(user, "email"),
        status: readText(user, "status"),
        createdAt: readText(user, "createdAt"),
        fields: compactFields({
          phone: readText(user, "phone"),
          company: readText(company, "name"),
          role: readText(membership, "role"),
          membershipStatus: readText(membership, "status"),
          adminRole: readText(admin, "role"),
          locale: readText(user, "locale"),
          timezone: readText(user, "timezone"),
          lastActiveAt: readText(session, "lastActiveAt"),
          activeSessions: records(user.sessions).length,
          trustedDevices: records(user.trustedDevices).length,
        }),
      };
    });
    metrics = { users: readNumber(record(raw.pagination), "total") ?? users.length };
  } else if (definition.key === "subscriptions") {
    const subscriptions = records(raw.subscriptions);
    items = subscriptions.map((subscription, index) => {
      const company = record(subscription.company);
      const plan = record(subscription.plan);
      const activatedBy = record(subscription.manuallyActivatedBy);
      return {
        id: readText(subscription, "id") ?? `subscription-${index}`,
        title: readText(company, "name") ?? "-",
        subtitle: readText(plan, "name"),
        status: readText(subscription, "status"),
        createdAt: readText(subscription, "createdAt"),
        updatedAt: readText(subscription, "updatedAt"),
        fields: compactFields({
          companyEmail: readText(company, "email"),
          companyId: readText(company, "id"),
          plan: readText(plan, "name"),
          planSlug: readText(plan, "slug"),
          whatsappAccountLimit: readNumber(plan, "maxWhatsappAccounts"),
          seatLimit: readNumber(plan, "maxTeamUsers"),
          billingPeriod: readText(subscription, "billingPeriod"),
          source: readText(subscription, "source"),
          provider: readText(subscription, "provider"),
          startsAt: readText(subscription, "startsAt"),
          endsAt: readText(subscription, "endsAt"),
          currentPeriodEndsAt: readText(subscription, "currentPeriodEndsAt"),
          cancelAtPeriodEnd: readBoolean(subscription, "cancelAtPeriodEnd"),
          createdBy: readText(activatedBy, "email") ?? readText(activatedBy, "name"),
          payments: records(subscription.payments).length,
          invoices: records(subscription.invoices).length,
          historyEvents: records(subscription.events).length,
        }),
      };
    });
    metrics = statusMetrics(subscriptions, "status", "subscriptions");
  } else if (definition.key === "invoices") {
    const invoices = records(raw.invoices);
    items = invoices.map((invoice, index) => {
      const company = record(invoice.company);
      return {
        id: readText(invoice, "id") ?? `invoice-${index}`,
        title: readText(invoice, "invoiceNumber") ?? readText(company, "name") ?? "-",
        subtitle: readText(company, "name"),
        status: readText(invoice, "status"),
        createdAt: readText(invoice, "createdAt"),
        updatedAt: readText(invoice, "updatedAt"),
        fields: compactFields({
          amount: readNumber(invoice, "totalAmount"),
          subtotal: readNumber(invoice, "subtotalAmount"),
          tax: readNumber(invoice, "taxAmount"),
          currency: readText(invoice, "currency"),
          provider: readText(invoice, "provider"),
          issuedAt: readText(invoice, "issuedAt"),
          dueAt: readText(invoice, "dueAt"),
          paidAt: readText(invoice, "paidAt"),
          documentAvailable: Boolean(readText(invoice, "pdfUrl")),
        }),
      };
    });
    metrics = { invoices: readNumber(record(raw.pagination), "total") ?? invoices.length };
  } else if (definition.key === "payments") {
    const payments = records(raw.payments);
    items = payments.map((payment, index) => {
      const company = record(payment.company);
      const plan = record(payment.plan);
      const invoice = record(payment.invoice);
      return {
        id: readText(payment, "id") ?? `payment-${index}`,
        title: readText(company, "name") ?? "-",
        subtitle: readText(plan, "name"),
        status: readText(payment, "status"),
        createdAt: readText(payment, "createdAt"),
        fields: compactFields({
          amount: readNumber(payment, "amount"),
          currency: readText(payment, "currency"),
          paymentMethod: readText(payment, "paymentMethod"),
          invoiceNumber: readText(invoice, "invoiceNumber"),
          paidAt: readText(payment, "paidAt"),
          failureReason: readText(payment, "failureReason"),
        }),
      };
    });
    metrics = { payments: readNumber(record(raw.pagination), "total") ?? payments.length };
  } else if (definition.key === "security") {
    const events = records(raw.events);
    items = events.map((event, index) => {
      const company = record(event.company);
      const user = record(event.user);
      return {
        id: readText(event, "id") ?? `security-${index}`,
        title: readText(event, "type") ?? readText(event, "message") ?? "-",
        subtitle: [readText(company, "name"), readText(user, "emailMasked")].filter(Boolean).join(" · "),
        status: readText(event, "status") ?? readText(event, "severity"),
        createdAt: readText(event, "createdAt"),
        fields: compactFields({
          severity: readText(event, "severity"),
          result: readText(event, "result"),
          source: readText(event, "source"),
          errorCode: readText(event, "errorCode"),
          company: readText(company, "name"),
          user: readText(user, "emailMasked"),
          correlationId: readText(event, "correlationId"),
          clientPlatform: readText(event, "clientPlatform"),
          appVersion: readText(event, "appVersion"),
          investigationNote: readText(event, "investigationNote"),
          acknowledgedAt: readText(event, "acknowledgedAt"),
          resolvedAt: readText(event, "resolvedAt"),
        }),
      };
    });
    metrics = statusMetrics(events, "severity", "events");
  } else if (definition.key === "trialRisk") {
    const entitlements = records(raw.items);
    items = entitlements.map((entitlement, index) => {
      const company = record(entitlement.company);
      const user = record(entitlement.user);
      const account = record(entitlement.whatsappAccount);
      return {
        id: readText(entitlement, "id") ?? `trial-risk-${index}`,
        title: readText(company, "name") ?? readText(user, "email") ?? "-",
        subtitle: readText(user, "email"),
        status: readText(entitlement, "status"),
        createdAt: readText(entitlement, "createdAt"),
        updatedAt: readText(entitlement, "updatedAt"),
        fields: compactFields({
          user: readText(user, "name"),
          whatsappAccount: readText(account, "displayName"),
          whatsappStatus: readText(account, "status"),
          riskScore: readNumber(entitlement, "riskScore"),
          decisionCode: readText(entitlement, "decisionCode"),
          riskSignals: displayPrimitive(entitlement.riskSignals),
          startedAt: readText(entitlement, "startedAt"),
          endsAt: readText(entitlement, "endsAt"),
          consumedAt: readText(entitlement, "consumedAt"),
        }),
      };
    });
    metrics = statusMetrics(entitlements, "status", "trialEntitlements");
  } else if (definition.key === "activity") {
    const logs = records(raw.logs);
    items = logs.map((event, index) => adminItem(event, `activity-${index}`, ["action", "entityType"], ["entityType"], ["company", "user", "entityId", "createdAt"]));
    metrics = { activity: readNumber(record(raw.pagination), "total") ?? logs.length };
  } else if (definition.key === "metrics") {
    metrics = primitiveRecord(raw.metrics);
  } else if (definition.key === "systemHealth") {
    const services = records(raw.services);
    const incidents = records(raw.incidents);
    metrics = compactFields({
      overallStatus: primitive(raw.status) ?? primitive(raw.app),
      services: services.length,
      activeIncidents: incidents.length,
      openAlerts: records(raw.alerts).length,
      capacityWarnings: records(raw.capacityWarnings).length,
    });
    items = [
      ...services.map((entry, index) => ({
        id: readText(entry, "id") ?? `service-${index}`,
        title: readText(entry, "name") ?? "-",
        subtitle: readText(entry, "summary"),
        status: readText(entry, "state"),
        updatedAt: readText(entry, "checkedAt"),
        fields: compactFields({
          recordType: "SERVICE",
          tier: readNumber(entry, "tier"),
          latencyMs: readNumber(entry, "latencyMs"),
          lastSuccessfulCheckAt: readText(entry, "lastSuccessfulCheckAt"),
          lastFailureAt: readText(entry, "lastFailureAt"),
          trend: readText(entry, "trend"),
          release: readText(entry, "release"),
          safeErrorCode: readText(entry, "safeErrorCode"),
          runbook: readText(entry, "runbook"),
          ...primitiveRecord(record(entry.metrics)),
        }),
        actions: [],
      } satisfies AdminModuleItem)),
      ...incidents.map((event, index) => ({
        ...adminItem(event, `incident-${index}`, ["title", "description"], ["status", "severity"], ["description", "startedAt", "resolvedAt"]),
        fields: compactFields({
          recordType: "INCIDENT",
          severity: readText(event, "severity"),
          description: readText(event, "description"),
          startedAt: readText(event, "startedAt"),
          resolvedAt: readText(event, "resolvedAt"),
          metadata: displayPrimitive(event.metadata),
        }),
        actions: ["ACKNOWLEDGED", "INVESTIGATING", "MITIGATED", "RESOLVED"],
      } satisfies AdminModuleItem)),
    ];
  }

  const sourcePagination = record(raw.pagination);
  const page = readNumber(sourcePagination, "page") ?? requestedPage;
  const total = readNumber(sourcePagination, "total") ?? items.length;
  const pages = readNumber(sourcePagination, "pages") ?? 1;
  return {
    generatedAt,
    metrics,
    items,
    pagination: { page, limit: 30, total, pages, nextPage: page < pages ? page + 1 : null },
    capabilities: {
      search: definition.searchable === true,
      filters: definition.statusOptions?.length ? ["status"] : [],
      actions: supportedActions(definition.key),
      readOnly: definition.coverage === "read-only",
      ...(definition.coverage === "read-only" ? { readOnlyReason: "This module has no safe administrator mutation in the current backend." } : {}),
    },
  };
}

function adminItem(source: Record<string, unknown>, fallbackId: string, titleKeys: string[], statusKeys: string[], fieldKeys: string[]): AdminModuleItem {
  return {
    id: readText(source, "id") ?? fallbackId,
    title: firstText(source, titleKeys) ?? "-",
    subtitle: nestedLabel(source.company) ?? nestedLabel(source.user) ?? null,
    status: firstText(source, statusKeys),
    createdAt: readText(source, "createdAt") ?? readText(source, "startedAt"),
    fields: compactFields(Object.fromEntries(fieldKeys.map((key) => [key, displayPrimitive(source[key])]))),
  };
}

function supportedActions(key: AdminModuleKey) {
  if (key === "companies") return ["SUSPEND", "REACTIVATE"];
  if (key === "users") return ["SUSPEND", "REACTIVATE", "FORCE_LOGOUT", "RESET_MFA", "REQUIRE_MFA"];
  if (key === "subscriptions") return ["ACTIVATE", "SUSPEND", "CANCEL", "REACTIVATE"];
  if (key === "payments") return ["MARK_PAID", "REJECT"];
  if (key === "trialRisk") return ["APPROVE_REVIEW", "BLOCK"];
  if (key === "security") return ["ACKNOWLEDGED", "RESOLVED", "DISMISSED"];
  if (key === "systemHealth") return ["ACKNOWLEDGED", "INVESTIGATING", "MITIGATED", "RESOLVED"];
  return [];
}

function statusMetrics(items: Record<string, unknown>[], key: string, totalKey: string) {
  const result: Record<string, string | number | boolean | null> = { [totalKey]: items.length };
  for (const item of items) {
    const status = readText(item, key);
    if (status) result[`status_${status}`] = Number(result[`status_${status}`] ?? 0) + 1;
  }
  return result;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(source: Record<string, unknown>, key: string) {
  const value = source[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumber(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function readBoolean(source: Record<string, unknown>, key: string) {
  return typeof source[key] === "boolean" ? source[key] as boolean : undefined;
}

function firstText(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readText(source, key);
    if (value) return value;
  }
  return undefined;
}

function nestedLabel(value: unknown) {
  const source = record(value);
  return readText(source, "name") ?? readText(source, "email");
}

function primitive(value: unknown): string | number | boolean | null {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null;
}

function displayPrimitive(value: unknown): string | number | boolean | null {
  const direct = primitive(value);
  if (direct !== null) return direct;
  const label = nestedLabel(value);
  return label ?? null;
}

function primitiveRecord(value: unknown) {
  const source = record(value);
  return compactFields(Object.fromEntries(Object.entries(source).map(([key, item]) => [key, primitive(item)])));
}

function compactFields(source: Record<string, string | number | boolean | null | undefined>) {
  return Object.fromEntries(Object.entries(source).filter((entry): entry is [string, string | number | boolean | null] => entry[1] !== undefined));
}

export function getAdminSupportTickets(params?: { cursor?: string; search?: string; status?: string; priority?: string; unreadOnly?: boolean; assignment?: "ALL" | "ME" | "UNASSIGNED" }) {
  const query = new URLSearchParams({ limit: "30" });
  if (params?.cursor) query.set("cursor", params.cursor);
  if (params?.search) query.set("search", params.search);
  if (params?.status) query.set("status", params.status);
  if (params?.priority) query.set("priority", params.priority);
  if (params?.unreadOnly) query.set("unread", "true");
  if (params?.assignment === "ME") query.set("assignedAdminId", "ME");
  if (params?.assignment === "UNASSIGNED") query.set("unassigned", "true");
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

export function assignAdminSupportTicket(id: string, assigned: boolean) {
  return apiClient.requestRaw<{ ticket: Pick<AdminSupportTicket, "id" | "assignedToAdmin"> }>(`/api/admin/support/tickets/${id}/assignment`, {
    method: "PATCH",
    body: JSON.stringify({ assignedAdminUserId: assigned ? "SELF" : null })
  });
}
