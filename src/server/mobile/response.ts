import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getRequestLocale, getServerTranslator } from "@/i18n/server";

export type MobileErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "SUBSCRIPTION_LOCKED"
  | "WHATSAPP_WORKER_UNAVAILABLE"
  | "CONFIGURATION_ERROR"
  | "INTERNAL_ERROR";

const errorKeyByCode: Record<string, string> = {
  UNAUTHORIZED: "api.error.sessionExpired",
  FORBIDDEN: "api.error.forbidden",
  NOT_FOUND: "api.error.notFound",
  VALIDATION_ERROR: "api.error.validation",
  RATE_LIMITED: "api.error.rateLimited",
  SUBSCRIPTION_LOCKED: "api.error.subscriptionLocked",
  WHATSAPP_WORKER_UNAVAILABLE: "api.error.generic",
  CONFIGURATION_ERROR: "api.error.configuration",
  INTERNAL_ERROR: "api.error.generic",
  ACCOUNT_EXISTS: "api.error.accountExists",
  ALREADY_MEMBER: "api.error.alreadyMember",
  BILLING_PROFILE_INCOMPLETE: "api.error.billingProfileIncomplete",
  CATEGORY_NOT_FOUND: "api.error.categoryNotFound",
  CONTACT_MESSAGING_REQUIRES_PROFESSIONAL: "api.error.contactMessagingProfessional",
  CONTACT_NOT_OWNED: "api.error.contactNotOwned",
  INVITATION_ALREADY_USED: "auth.invitationAlreadyUsed",
  INVITATION_DECLINED: "auth.invitationDeclined",
  INVITATION_EMAIL_MISMATCH: "auth.invitationEmailMismatch",
  INVITATION_EXPIRED: "auth.invitationExpired",
  INVITATION_INVALID: "auth.invitationInvalid",
  INVITATION_REVOKED: "auth.invitationRevoked",
  NO_SENDABLE_GROUPS: "api.error.noSendableGroups",
  RESET_CODE_INVALID: "api.error.resetCodeInvalid",
  SEAT_LIMIT_REACHED: "api.error.seatLimitReached",
  TICKET_CLOSED: "support.closedNoReply",
  SUPPORT_TICKET_CLOSED: "support.closedNoReply",
  SUPPORT_TICKET_NOT_FOUND: "api.error.supportTicketNotFound",
  SUPPORT_INVALID_CATEGORY: "api.error.validation",
  SUPPORT_INVALID_CLIENT_MESSAGE_ID: "api.error.validation",
  SUPPORT_INVALID_ATTACHMENT: "api.error.validation",
  SUPPORT_VALIDATION_ERROR: "api.error.validation",
  SUPPORT_INVALID_STATUS_TRANSITION: "support.invalidTransition",
  SUPPORT_INVALID_STATUS: "api.error.validation",
  SUPPORT_INVALID_PRIORITY: "api.error.validation",
  SUPPORT_INVALID_ASSIGNEE: "api.error.validation",
  SUPPORT_RATE_LIMITED: "api.error.rateLimited",
  SUPPORT_DEPENDENCY_UNAVAILABLE: "api.error.generic",
  WHATSAPP_ACCOUNT_NOT_OWNED: "api.error.whatsappAccountRequired",
  WHATSAPP_ACCOUNT_REQUIRED: "api.error.whatsappAccountRequired",
  PASSWORD_REQUIRED: "auth.passwordRequired",
  PASSWORD_TOO_SHORT: "auth.passwordTooShort",
  PASSWORD_CONFIRMATION_MISMATCH: "auth.passwordConfirmationMismatch",
  PASSWORD_INVALID_TYPE: "auth.passwordInvalidType",
  PASSWORD_CONFIRMATION_REQUIRED: "auth.passwordRequired",
  INVALID_TOTP_CODE: "api.error.authMfaCodeInvalid",
  MFA_INVALID: "api.error.authMfaCodeInvalid",
  MFA_CODE_REUSED: "api.error.authMfaCodeReused",
  MFA_EMAIL_OTP_INVALID: "api.error.authMfaCodeInvalid",
  MFA_EMAIL_OTP_EXPIRED: "api.error.authMfaChallengeExpired",
  MFA_CHALLENGE_INVALID: "api.error.authMfaChallengeExpired",
  MFA_CHALLENGE_LOCKED: "api.error.authMfaRateLimited",
  TOO_MANY_TOTP_ATTEMPTS: "api.error.authMfaRateLimited",
  MFA_METHOD_NOT_ENABLED: "security.disabled",
  MFA_METHOD_REQUIRED_BY_POLICY: "security.policyActionRequired",
  RECENT_AUTHENTICATION_REQUIRED: "api.error.validation",
  MFA_DEVICE_MISMATCH: "api.error.sessionExpired",
  REGISTRATION_FAILED: "api.error.registrationFailed",
  EMAIL_ALREADY_REGISTERED: "api.error.accountExists",
  MESSAGE_ATTRIBUTION_LENGTH_EXCEEDED: "api.error.messageAttributionTooLong",
  INVALID_WHATSAPP_PHONE: "accounts.phoneInvalid",
  PHONE_COUNTRY_MISMATCH: "accounts.phoneInvalid",
  UNSUPPORTED_PHONE_COUNTRY: "accounts.countryUnsupported",
  DUPLICATE_PHONE_COUNTRY_CODE: "accounts.countryCodeDuplicate",
  MEMBER_SELF_MANAGED_AFTER_ACTIVATION: "membership.usersReadOnly",
  PENDING_MEMBER_MANAGEMENT_ONLY: "membership.usersReadOnly",
  MEMBER_ALREADY_ACTIVATED: "membership.usersReadOnly",
  USER_MANAGEMENT_FORBIDDEN: "api.error.forbidden",
  ACTIVE_SHARED_MEMBERSHIP_EXISTS: "membership.sharedSubscriptionReadOnly",
  INDEPENDENT_CONVERSION_NOT_ALLOWED: "api.error.forbidden",
  SHARED_SUBSCRIPTION_READ_ONLY: "membership.sharedSubscriptionReadOnly",
  TENANT_DELETE_FORBIDDEN: "membership.sharedDeleteScope",
};

const legacyMessageKeys: Record<string, string> = {
  "E-posta/telefon veya parola hatalı.": "api.error.invalidCredentials",
  "Çalışma alanı bulunamadı.": "api.error.workspaceNotFound",
  "Mobil kimlik doğrulama yapılandırılmamış.": "api.error.mobileAuthConfiguration",
  "Bu e-posta veya telefonla kayıtlı hesap var.": "api.error.accountExists",
  "Deneme paketi yapılandırılmamış.": "api.error.trialConfiguration",
  "Kayıt tamamlanamadı.": "api.error.registrationFailed",
  "Oturumunuz geçersiz veya süresi dolmuş.": "api.error.sessionExpired",
  "Bu işlem için yetkiniz yok.": "api.error.forbidden",
  "Çok fazla istek yapıldı. Lütfen biraz sonra tekrar deneyin.": "api.error.rateLimited",
  "Paketiniz bu işlem için uygun değil.": "api.error.subscriptionLocked",
  "Girilen bilgiler geçersiz.": "api.error.validation",
  "Geçerli JSON isteği gönderilmedi.": "api.error.invalidJson",
  "WhatsApp hesabı bulunamadı.": "api.error.whatsappAccountNotFound",
  "WhatsApp hesabınızı bağlayın": "api.error.whatsappAccountRequired",
  "WhatsApp hesabınızı bağlayın.": "api.error.whatsappAccountRequired",
  "QR kod oluşturulamadı.": "api.error.qrCreateFailed",
  "Telefon kodu oluşturulamadı.": "api.error.phoneCodeCreateFailed",
  "Yeniden bağlantı başlatılamadı.": "api.error.reconnectFailed",
  "Hesap arşivlenemedi.": "api.error.archiveFailed",
  "Aboneliğiniz aktif değil. WhatsApp hesabı bağlamak için aboneliğinizi yenileyin.": "api.error.subscriptionConnectLocked",
  "Kişilere mesaj gönderimi Profesyonel paketinde kullanılabilir.": "api.error.contactMessagingProfessional",
  "Kişilere mesaj göndermek için aktif bir abonelik gerekir.": "api.error.contactMessagingProfessional",
  "Çok fazla kişi eşitleme isteği gönderdiniz. Lütfen daha sonra tekrar deneyin.": "api.error.contactSyncRateLimited",
  "Kategori bulunamadı.": "api.error.categoryNotFound",
  "Kategori oluşturulamadı.": "api.error.categoryCreateFailed",
  "Kategori güncellenemedi.": "api.error.categoryUpdateFailed",
  "Kategori kişileri yüklenemedi.": "api.error.categoryContactsLoadFailed",
  "Planınızdaki kullanılabilir hesap kapasitesi dolu.": "api.error.seatLimitReached",
  "Bu kullanıcı zaten çalışma alanına eklenmiş.": "api.error.alreadyMember",
  "Çok fazla davet isteği gönderdiniz. Lütfen daha sonra tekrar deneyin.": "api.error.invitationRateLimited",
  "Destek talebi bulunamadı.": "api.error.supportTicketNotFound",
  "Talep kapalı olduğu için yanıt yazılamaz.": "support.closedNoReply",
  "Destek mesajı gönderilemedi.": "api.error.supportMessageFailed",
  "Destek talebi oluşturulamadı.": "support.createFailed",
  "Bildirim bulunamadı.": "api.error.notificationNotFound",
  "Bildirimler alınamadı.": "api.error.notificationsLoadFailed",
  "Bildirim okundu olarak işaretlenemedi.": "api.error.notificationReadFailed",
  "Bildirimler okundu olarak işaretlenemedi.": "api.error.notificationsReadFailed",
  "Okunmamış bildirim sayısı alınamadı.": "api.error.notificationCountFailed",
  "Bildirim cihazı kaydedilemedi.": "api.error.pushRegisterFailed",
  "Bildirim cihazı kaldırılamadı.": "api.error.pushRemoveFailed",
  "Gönderilebilir bağlı WhatsApp grubu bulunamadı.": "api.error.noSendableGroups",
  "Mesaj gönderilemedi.": "api.error.messageSendFailed",
  "Zamanlı mesaj oluşturulamadı.": "api.error.scheduleFailed",
  "Kod hatalı, süresi dolmuş veya kullanılamıyor.": "api.error.resetCodeInvalid",
  "Kod doğrulanamadı.": "api.error.resetCodeVerifyFailed",
  "Kod hatalı, süresi dolmuş veya kullanılmış.": "api.error.resetCodeInvalid",
  "Şifre sıfırlama tamamlanamadı.": "api.error.passwordResetFailed",
  "Çıkış yapılamadı.": "api.error.logoutFailed",
  "Plan bulunamadı.": "api.error.planNotFound",
  "Yükseltme için ödeme bilgilerinizi tamamlayın.": "api.error.billingProfileIncomplete",
  "Paket yükseltme talebi oluşturulamadı.": "api.error.upgradeRequestFailed",
  "Geri bildirim gönderilemedi.": "api.error.feedbackFailed",
  "İşlem şu anda tamamlanamadı.": "api.error.generic",
};

const successMessageKeys: Record<string, string> = {
  "Hesap kapatma talebi alindi.": "api.success.accountClosureRequested",
  "Paket yükseltme talebiniz alındı. Ekibimiz sizinle iletişime geçecektir.": "api.success.upgradeRequested",
  "Şifreniz başarıyla güncellendi.": "api.success.passwordUpdated",
  "Eğer bilgiler sistemde kayıtlıysa doğrulama kodu gönderilmiştir.": "api.success.resetCodeSent",
  "WhatsApp grupları yenileniyor": "api.success.groupsSyncing",
  "WhatsApp hesabınızı bağlayın": "api.error.whatsappAccountRequired",
};

async function requestTranslator() {
  return getServerTranslator(await getRequestLocale());
}

async function resolveMessage(code: string, message: string) {
  const { t } = await requestTranslator();
  const key = legacyMessageKeys[message] ?? (message.includes(".") && !message.includes(" ") ? message : null) ?? errorKeyByCode[code] ?? "api.error.generic";
  const translated = t(key);
  return translated === key ? t("api.error.generic") : translated;
}

async function localizeSuccessData<T>(data: T): Promise<T> {
  if (!data || typeof data !== "object") return data;
  const { t } = await requestTranslator();
  const copy = { ...(data as Record<string, unknown>) };
  if (typeof copy.message === "string") {
    const key = successMessageKeys[copy.message] ?? legacyMessageKeys[copy.message] ?? (copy.message.includes(".") && !copy.message.includes(" ") ? copy.message : undefined);
    if (key) copy.message = t(key);
  }
  if (Array.isArray(copy.notifications)) {
    copy.notifications = copy.notifications.map((notification) => {
      if (!notification || typeof notification !== "object") return notification;
      const item = { ...(notification as Record<string, unknown>) };
      const type = typeof item.type === "string" ? item.type : "";
      const payload = item.payload && typeof item.payload === "object" ? item.payload as Record<string, unknown> : {};
      const variables = Object.fromEntries(
        Object.entries(payload).filter((entry): entry is [string, string | number] => typeof entry[1] === "string" || typeof entry[1] === "number"),
      );
      const titleKey = `notification.title.${type}`;
      const messageKey = `notification.message.${type}`;
      const title = t(titleKey, variables);
      const message = t(messageKey, variables);
      if (title !== titleKey) item.title = title;
      if (message !== messageKey) item.message = message;
      return item;
    });
  }
  return copy as T;
}

export async function mobileSuccess<T>(data: T, init?: { status?: number; meta?: Record<string, unknown> }) {
  return NextResponse.json({ success: true, data: await localizeSuccessData(data), meta: init?.meta ?? {} }, { status: init?.status ?? 200 });
}

export async function mobileError(code: MobileErrorCode | string, message: string, init?: { status?: number; details?: unknown }) {
  return NextResponse.json(
    { success: false, error: { code, message: await resolveMessage(code, message), details: init?.details ?? null } },
    { status: init?.status ?? 400 },
  );
}

export async function mobileValidationError(error: ZodError) {
  return mobileError("VALIDATION_ERROR", "api.error.validation", { status: 400, details: error.flatten().fieldErrors });
}

export async function mobileSafeError(error: unknown, fallback = "api.error.generic") {
  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") return mobileError("UNAUTHORIZED", "api.error.sessionExpired", { status: 401 });
    if (error.message.startsWith("Missing permission")) return mobileError("FORBIDDEN", "api.error.forbidden", { status: 403 });
    if (error.message === "RATE_LIMITED") return mobileError("RATE_LIMITED", "api.error.rateLimited", { status: 429 });
    if (error.message === "SUBSCRIPTION_LOCKED") return mobileError("SUBSCRIPTION_LOCKED", "api.error.subscriptionLocked", { status: 403 });
    if (error.message === "WHATSAPP_ACCOUNT_REQUIRED") {
      return mobileError("WHATSAPP_ACCOUNT_REQUIRED", "api.error.whatsappAccountRequired", { status: 409 });
    }
    if (error.message === "MESSAGE_ATTRIBUTION_LENGTH_EXCEEDED") {
      return mobileError("MESSAGE_ATTRIBUTION_LENGTH_EXCEEDED", "api.error.messageAttributionTooLong", { status: 400 });
    }
    const mfaStatusByCode: Record<string, number> = {
      PASSWORD_CONFIRMATION_REQUIRED: 401,
      INVALID_TOTP_CODE: 401,
      MFA_INVALID: 401,
      MFA_CODE_REUSED: 401,
      MFA_EMAIL_OTP_INVALID: 401,
      MFA_EMAIL_OTP_EXPIRED: 401,
      MFA_CHALLENGE_INVALID: 401,
      MFA_DEVICE_MISMATCH: 401,
      MFA_CHALLENGE_LOCKED: 429,
      TOO_MANY_TOTP_ATTEMPTS: 429,
      MFA_METHOD_NOT_ENABLED: 409,
      MFA_METHOD_REQUIRED_BY_POLICY: 409,
      RECENT_AUTHENTICATION_REQUIRED: 400,
    };
    const mfaStatus = mfaStatusByCode[error.message];
    if (mfaStatus) {
      return mobileError(error.message, error.message, { status: mfaStatus });
    }
    if (
      error.message.includes("WhatsApp worker is not reachable")
      || error.message.includes("WHATSAPP_WORKER_URL_REQUIRED")
    ) {
      return mobileError("WHATSAPP_WORKER_UNAVAILABLE", fallback, {
        status: 503,
        details: { retryable: true },
      });
    }
  }
  return mobileError("INTERNAL_ERROR", fallback, { status: 500 });
}
