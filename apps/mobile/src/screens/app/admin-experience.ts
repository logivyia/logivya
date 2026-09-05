import type { AdminModuleKey } from "@/api/mobileAdmin";

export type AdminDestination = { moduleKey: AdminModuleKey; initialStatus?: string; initialSearch?: string };

const destinations: Record<string, AdminDestination> = {
  companies: { moduleKey: "companies" }, activeCompanies: { moduleKey: "companies", initialStatus: "ACTIVE" },
  suspendedCompanies: { moduleKey: "companies", initialStatus: "DISABLED" }, companiesUnderInvestigation: { moduleKey: "companies", initialStatus: "UNDER_INVESTIGATION" },
  users: { moduleKey: "users" }, members: { moduleKey: "users" }, activeUsers: { moduleKey: "users", initialStatus: "ACTIVE" }, suspendedUsers: { moduleKey: "users", initialStatus: "SUSPENDED" },
  activeSubscriptions: { moduleKey: "subscriptions", initialStatus: "ACTIVE" }, activeSubscriptionCompanies: { moduleKey: "subscriptions", initialStatus: "ACTIVE" },
  subscriptions: { moduleKey: "subscriptions" }, trials: { moduleKey: "subscriptions", initialStatus: "TRIALING" }, trialSubscriptions: { moduleKey: "subscriptions", initialStatus: "TRIALING" }, trialCompanies: { moduleKey: "subscriptions", initialStatus: "TRIALING" },
  expiredSubscriptions: { moduleKey: "subscriptions", initialStatus: "EXPIRED" }, suspendedSubscriptions: { moduleKey: "subscriptions", initialStatus: "SUSPENDED" },
  pendingSubscriptionRequests: { moduleKey: "subscriptions" }, expiringInSevenDays: { moduleKey: "subscriptions", initialStatus: "ACTIVE" },
  invoices: { moduleKey: "invoices" }, payments: { moduleKey: "payments" }, successfulPayments: { moduleKey: "payments" }, pendingPayments: { moduleKey: "payments", initialStatus: "PENDING" }, failedPayments: { moduleKey: "payments", initialStatus: "FAILED" }, refundedPayments: { moduleKey: "payments", initialStatus: "REFUNDED" },
  accounts: { moduleKey: "whatsappAccounts" }, connected: { moduleKey: "whatsappAccounts", initialStatus: "CONNECTED" }, connectedAccounts: { moduleKey: "whatsappAccounts", initialStatus: "CONNECTED" }, reconnectingAccounts: { moduleKey: "whatsappAccounts", initialStatus: "RECONNECT_REQUIRED" }, failedAccounts: { moduleKey: "whatsappAccounts", initialStatus: "FAILED" },
  campaigns: { moduleKey: "campaigns" }, messages: { moduleKey: "campaigns" }, queuedCampaigns: { moduleKey: "campaigns", initialStatus: "QUEUED" }, runningCampaigns: { moduleKey: "campaigns", initialStatus: "SENDING" }, completedCampaigns: { moduleKey: "campaigns", initialStatus: "COMPLETED" }, failedCampaigns: { moduleKey: "campaigns", initialStatus: "FAILED" },
  openSupportTickets: { moduleKey: "support" }, urgentTickets: { moduleKey: "support" }, criticalSecurityAlerts: { moduleKey: "security" },
  activeIncidents: { moduleKey: "systemHealth" }, openAlerts: { moduleKey: "systemHealth" }, requests: { moduleKey: "dataRequests" }, exports: { moduleKey: "dataRequests" }, deletions: { moduleKey: "dataRequests" },
};

export function adminMetricDestination(moduleKey: AdminModuleKey, key: string): AdminDestination | null {
  if (key.startsWith("status_")) return { moduleKey, initialStatus: key.slice(7) };
  if (key.startsWith("revenue_") || key.startsWith("monthlyRevenue_") || key === "monthlyConfirmedPaymentTotal") return { moduleKey: "billing" };
  if (moduleKey === "companies" && ["active", "disabled"].includes(key)) return { moduleKey, initialStatus: key.toUpperCase() };
  if (moduleKey === "subscriptions" && ["active", "trialing", "expired", "suspended", "canceled"].includes(key)) return { moduleKey, initialStatus: key.toUpperCase() };
  return destinations[key] ?? (key === "total" ? { moduleKey, initialStatus: "ALL" } : null);
}

const fieldLabels: Record<string, string> = {
  abuseScore: "Kötüye kullanım puanı", activeKeys: "Aktif API anahtarları", actor: "İşlemi yapan", actorType: "İşlemi yapanın türü", adminAccess: "Yönetici erişimi", apiContractVersion: "API sözleşmesi sürümü",
  releases: "Sürümler", failedRequiredChecks: "Başarısız zorunlu kontroller",
  approvals: "Onaylar", archived: "Arşivlenen", artifacts: "Derleme dosyaları", auditEvents: "Denetim olayları", averageLatencyMs: "Ortalama yanıt süresi (ms)", buildDate: "Derleme tarihi",
  canceled: "İptal edilen", channel: "Kanal", completed: "Tamamlanan", completedAt: "Tamamlanma zamanı", configured: "Yapılandırılan", consents: "İzin kayıtları", dataRequests: "Veri talepleri",
  deadLetterDeliveries: "Yeniden denemeleri tükenen gönderimler", deletionRequests: "Silme talepleri", enabled: "Etkin", endpoints: "Bağlantı adresleri", errorCategory: "Hata kategorisi", errors: "Hatalar", eventCount: "Olay sayısı",
  failed: "Başarısız", failedChecks: "Başarısız kontroller", failedDeliveries: "Başarısız gönderimler", gitCommit: "Kaynak kod revizyonu", granted: "Verilen izinler", healthScore: "Sistem sağlık puanı", inactive: "Pasif", key: "Anahtar",
  lastConnectedAt: "Son bağlantı", lastContactSyncAt: "Son kişi eşitlemesi", lastDeliveredAt: "Son teslim zamanı", lastDelivery: "Son gönderim", lastGroupSyncAt: "Son grup eşitlemesi", lastHeartbeatAt: "Son çalışma sinyali", lastResponseStatus: "Son yanıt durumu", lastSyncedAt: "Son eşitleme",
  latestArtifact: "Son derleme dosyası", latestArtifactSha256: "Son dosyanın SHA-256 özeti", latestArtifactType: "Son dosyanın türü", maintenanceMode: "Bakım modu", passedChecks: "Başarılı kontroller", pending: "Bekleyen", pendingRequests: "Bekleyen talepler", plans: "Paketler", publicRegistration: "Yeni kullanıcı kaydı",
  reconnectAttempts: "Yeniden bağlantı denemeleri", requiredChecks: "Zorunlu kontroller", rollout: "Kullanıma sunma", rolloutPercentage: "Kullanıma sunulma oranı", rolloutStatus: "Kullanıma sunulma durumu", sensitiveAccess: "Hassas verilere erişim", sessionRestoredAt: "Oturumun geri yüklenme zamanı", snapshotAvailable: "Anlık kopya mevcut",
  store: "Mağaza", storeStatus: "Mağaza durumu", succeeded: "Başarılı", supportedCurrencies: "Desteklenen para birimleri", supportedLocales: "Desteklenen diller", targetType: "Hedef türü", teamSeats: "Ekip kullanıcı hakları", tests: "Testler", trialDays: "Deneme süresi (gün)", type: "Tür", unread: "Okunmamış", version: "Sürüm", versionCode: "Sürüm kodu", versionName: "Sürüm adı",
  total: "Toplam kayıt", active: "Aktif", disabled: "Devre dışı", companies: "Çalışma alanları", activeCompanies: "Aktif çalışma alanları", suspendedCompanies: "Askıdaki çalışma alanları", companiesUnderInvestigation: "İncelenen çalışma alanları",
  users: "Kullanıcılar", totalUsers: "Toplam kullanıcı", activeUsers: "Aktif kullanıcılar", suspendedUsers: "Askıdaki kullanıcılar", members: "Üyeler", activeSuperAdmins: "Aktif üst yöneticiler", activeSessions: "Aktif oturumlar", trustedDevices: "Güvenilir cihazlar",
  subscriptions: "Abonelikler", activeSubscriptions: "Aktif abonelikler", activeSubscriptionCompanies: "Aktif aboneliği olan alanlar", trialSubscriptions: "Deneme abonelikleri", trialCompanies: "Deneme hesapları", trials: "Deneme abonelikleri", expiredSubscriptions: "Süresi dolan abonelikler", suspendedSubscriptions: "Askıdaki abonelikler", pendingSubscriptionRequests: "Bekleyen abonelik talepleri", expiringInSevenDays: "7 gün içinde sona erecek", incompleteBillingProfiles: "Eksik fatura profilleri",
  payments: "Ödemeler", invoices: "Faturalar", successfulPayments: "Başarılı ödemeler", failedPayments: "Başarısız ödemeler", pendingPayments: "Bekleyen ödemeler", refundedPayments: "İade edilen ödemeler", monthlyConfirmedPaymentTotal: "Bu ay onaylanan ödemeler (TRY)",
  accounts: "WhatsApp hesapları", connected: "Bağlı hesaplar", disconnected: "Bağlı olmayan hesaplar", connectedAccounts: "Bağlı hesaplar", reconnectingAccounts: "Yeniden bağlantı bekleyenler", failedAccounts: "Bağlantı hataları", whatsappAccounts: "WhatsApp hesapları", whatsappAccount: "WhatsApp hesabı", whatsappStatus: "WhatsApp durumu",
  campaigns: "Kampanyalar", queuedCampaigns: "Sıradaki kampanyalar", runningCampaigns: "Devam eden kampanyalar", completedCampaigns: "Tamamlanan kampanyalar", failedCampaigns: "Başarısız kampanyalar", messages: "Mesajlar", groups: "Gruplar", contacts: "Kişiler", openSupportTickets: "Açık destek talepleri", urgentTickets: "Acil destek talepleri", criticalSecurityAlerts: "Kritik güvenlik olayları",
  services: "Servisler", overallStatus: "Genel durum", activeIncidents: "Aktif olaylar", openAlerts: "Açık uyarılar", capacityWarnings: "Kapasite uyarıları", events: "Olaylar", activity: "İşlem geçmişi", tickets: "Destek talepleri", supportTickets: "Destek talepleri", requests: "Talepler", exports: "Dışa aktarımlar", deletions: "Silme talepleri", activeLegalHolds: "Yasal koruma kayıtları", openBreaches: "Açık ihlal kayıtları", dpiasRequiringReview: "İnceleme bekleyen değerlendirmeler", trialEntitlements: "Deneme hakları",
  owner: "Hesap sahibi", ownerEmail: "Hesap sahibinin e-postası", email: "E-posta", phone: "Telefon", company: "Çalışma alanı", companyEmail: "Çalışma alanı e-postası", companyId: "Çalışma alanı kimliği", user: "Kullanıcı", role: "Rol", adminRole: "Yönetici rolü", membershipStatus: "Üyelik durumu", locale: "Dil", timezone: "Saat dilimi", plan: "Paket", planSlug: "Paket kodu", subscriptionStatus: "Abonelik durumu", seatsUsed: "Kullanılan kullanıcı hakkı", seatLimit: "Kullanıcı limiti", seatsAvailable: "Kalan kullanıcı hakkı", whatsappAccountLimit: "WhatsApp hesap limiti", billingPeriod: "Faturalama dönemi", provider: "Sağlayıcı", source: "Kaynak", createdBy: "Oluşturan", historyEvents: "Geçmiş işlemler",
  startsAt: "Başlangıç", startedAt: "Başlangıç", endsAt: "Bitiş", currentPeriodEndsAt: "Dönem sonu", cancelAtPeriodEnd: "Dönem sonunda iptal", createdAt: "Oluşturulma", updatedAt: "Güncelleme", lastActivityAt: "Son etkinlik", lastActiveAt: "Son kullanım", issuedAt: "Düzenlenme", dueAt: "Son ödeme", paidAt: "Ödeme zamanı", failedAt: "Hata zamanı", acknowledgedAt: "İncelemeye alınma", resolvedAt: "Çözülme", consumedAt: "Kullanılma", finishedAt: "Tamamlanma",
  amount: "Tutar", subtotal: "Ara toplam", tax: "Vergi", currency: "Para birimi", paymentMethod: "Ödeme yöntemi", invoiceNumber: "Fatura numarası", documentAvailable: "Belge mevcut", failureReason: "Başarısızlık nedeni", severity: "Önem derecesi", result: "Sonuç", errorCode: "Hata kodu", correlationId: "Takip kimliği", clientPlatform: "Platform", appVersion: "Uygulama sürümü", investigationNote: "İnceleme notu", riskScore: "Risk puanı", riskSignals: "Risk göstergeleri", decisionCode: "Karar kodu", recordType: "Kayıt türü", description: "Açıklama", metadata: "Ek bilgiler", dryRun: "Deneme çalıştırması", tier: "Öncelik seviyesi", latencyMs: "Yanıt süresi (ms)", lastSuccessfulCheckAt: "Son başarılı kontrol", lastFailureAt: "Son hata", trend: "Eğilim", release: "Sürüm", safeErrorCode: "Hata kodu", runbook: "İşletim kılavuzu",
};

export function adminPresentationLabel(key: string, locale: string): string {
  if (key.startsWith("revenue_")) return `${locale === "tr" ? "Toplam gelir" : "Revenue"} · ${key.slice(8)}`;
  if (key.startsWith("monthlyRevenue_")) return `${locale === "tr" ? "Bu ay gelir" : "Monthly revenue"} · ${key.slice(15)}`;
  return (locale === "tr" ? fieldLabels[key] : undefined) ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
}

const eventLabels: Record<string, string> = {
  SUSPICIOUS_LOGIN: "Şüpheli giriş", AUTH_FAILURE: "Kimlik doğrulama hatası", ACCESS_DENIED: "Erişim engellendi",
  AUTH_REFRESH_TOKEN_REJECTED: "Oturum yenileme isteği reddedildi", AUTH_REFRESH_TOKEN_REPLAY_DETECTED: "Yinelenen oturum yenileme isteği", MFA_LOGIN_SUCCEEDED: "Doğrulama ile giriş başarılı", LOGIN_SUCCEEDED: "Giriş başarılı", LOGIN_FAILED: "Giriş başarısız", AUTH_LOGIN_FAILED: "Giriş başarısız",
};
export function adminEventTitle(title: string, locale: string) { return (locale === "tr" ? eventLabels[title] : undefined) ?? title; }

const settingsTitles: Record<string, string> = {
  maintenance: "Bakım modu",
  email: "E-posta sağlayıcısı",
  backups: "Yedekleme sağlayıcısı",
  registration: "Yeni kullanıcı kaydı",
};

export function adminSettingsTitle(id: string, title: string, locale: string) {
  return (locale === "tr" ? settingsTitles[id] : undefined) ?? title;
}
