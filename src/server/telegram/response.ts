import { mobileError, mobileSafeError } from "@/server/mobile/response";

export function telegramSafeError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "TELEGRAM_SUBSCRIPTION_LOCKED" || code === "TELEGRAM_PLAN_FORBIDDEN") {
    return mobileError(code, "Bu gönderim için paketinizin aktif olması ve gerekli mesajlaşma özelliğini içermesi gerekir.", { status: 403 });
  }
  if (code === "TELEGRAM_SEND_FORBIDDEN") return mobileError(code, "Bu çalışma alanında mesaj gönderme yetkiniz yok.", { status: 403 });
  if (code === "TELEGRAM_NOT_FOUND" || code === "TELEGRAM_ACCOUNT_NOT_FOUND" || code === "TELEGRAM_CHAT_NOT_FOUND") {
    return mobileError("NOT_FOUND", "api.error.notFound", { status: 404 });
  }
  if (code === "TELEGRAM_PHONE_INVALID" || code === "TELEGRAM_MEDIA_PERMISSION_DENIED" || code === "MEDIA_FILE_NOT_FOUND" || code.startsWith("TELEGRAM_VALIDATION_")) {
    return mobileError("VALIDATION_ERROR", "api.error.validation", { status: 400 });
  }
  if (code === "TELEGRAM_MEDIA_TOO_LARGE") {
    return mobileError(code, "Telegram için her dosya en fazla 2 GB olabilir.", { status: 413 });
  }
  if (code === "TELEGRAM_ACCOUNT_NOT_READY" || code.startsWith("TELEGRAM_AUTH_STATE_")) {
    return mobileError("TELEGRAM_AUTH_REQUIRED", "api.error.validation", { status: 409 });
  }
  if (code === "TELEGRAM_DELETE_BUSY") {
    return mobileError("TELEGRAM_DELETE_BUSY", "api.error.generic", {
      status: 409,
      details: { retryable: true },
    });
  }
  if (code === "TELEGRAM_DELETE_UNAVAILABLE") {
    return mobileError("TELEGRAM_DELETE_UNAVAILABLE", "api.error.validation", {
      status: 409,
    });
  }
  if (code === "TELEGRAM_WORKER_NOT_CONFIGURED" || code.startsWith("TELEGRAM_WORKER_")) {
    return mobileError("TELEGRAM_WORKER_UNAVAILABLE", "api.error.generic", { status: 503, details: { retryable: true } });
  }
  if (code === "PHONE_CODE_INVALID" || code === "PASSWORD_HASH_INVALID" || code === "EMAIL_CODE_INVALID") {
    return mobileError("TELEGRAM_AUTH_INVALID", "api.error.validation", { status: 400 });
  }
  return mobileSafeError(error);
}
