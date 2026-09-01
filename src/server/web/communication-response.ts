import "server-only";

import { NextResponse } from "next/server";

const SAFE_MESSAGES = {
  unauthorized: "Oturumunuz doğrulanamadı. Lütfen yeniden giriş yapın.",
  forbidden: "Bu işlem için yetkiniz bulunmuyor.",
  notFound: "İstenen iletişim alanı veya kayıt bulunamadı.",
  validation: "Gönderilen bilgiler geçerli değil.",
  conflict: "Hesap bağlantısının yenilenmesi gerekiyor.",
  rateLimited: "Çok fazla istek gönderildi. Lütfen biraz sonra yeniden deneyin.",
  unavailable: "İletişim hizmetine şu anda ulaşılamıyor.",
  generic: "İşlem tamamlanamadı. Lütfen yeniden deneyin.",
} as const;

export function webCommunicationValidationError(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return NextResponse.json(
    {
      ok: false,
      error: "VALIDATION_ERROR",
      message: SAFE_MESSAGES.validation,
      fields: issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    },
    { status: 400 },
  );
}

export function webCommunicationSafeError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "UNAUTHORIZED") {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED", message: SAFE_MESSAGES.unauthorized }, { status: 401 });
  }
  if (code === "RATE_LIMITED") {
    return NextResponse.json({ ok: false, error: "RATE_LIMITED", message: SAFE_MESSAGES.rateLimited }, { status: 429 });
  }
  if (code.startsWith("Missing permission") || code.endsWith("_FORBIDDEN")) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN", message: SAFE_MESSAGES.forbidden }, { status: 403 });
  }
  if (code.endsWith("_NOT_FOUND") || code === "TELEGRAM_NOT_FOUND" || code === "FACEBOOK_NOT_FOUND") {
    return NextResponse.json({ ok: false, error: "NOT_FOUND", message: SAFE_MESSAGES.notFound }, { status: 404 });
  }
  if (
    code.startsWith("TELEGRAM_VALIDATION_")
    || code.startsWith("FACEBOOK_VALIDATION_")
    || code === "MEDIA_FILE_NOT_FOUND"
    || code === "TELEGRAM_MEDIA_PERMISSION_DENIED"
  ) {
    return NextResponse.json({ ok: false, error: "VALIDATION_ERROR", message: SAFE_MESSAGES.validation }, { status: 400 });
  }
  if (code === "TELEGRAM_MEDIA_TOO_LARGE") {
    return NextResponse.json({ ok: false, error: code, message: SAFE_MESSAGES.validation }, { status: 413 });
  }
  if (
    code === "TELEGRAM_ACCOUNT_NOT_READY"
    || code.startsWith("TELEGRAM_AUTH_STATE_")
    || code === "FACEBOOK_RECONNECT_REQUIRED"
    || code === "FACEBOOK_POST_PROCESSING"
    || code === "FACEBOOK_IDEMPOTENCY_CONFLICT"
  ) {
    return NextResponse.json({ ok: false, error: "CONFLICT", message: SAFE_MESSAGES.conflict }, { status: 409 });
  }
  if (
    code === "TELEGRAM_WORKER_NOT_CONFIGURED"
    || code.startsWith("TELEGRAM_WORKER_")
    || code === "FACEBOOK_GRAPH_TIMEOUT"
    || code === "FACEBOOK_GRAPH_UNAVAILABLE"
    || code === "FACEBOOK_NOT_CONFIGURED"
  ) {
    return NextResponse.json({ ok: false, error: "SERVICE_UNAVAILABLE", message: SAFE_MESSAGES.unavailable }, { status: 503 });
  }
  return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", message: SAFE_MESSAGES.generic }, { status: 500 });
}
