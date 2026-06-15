import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type MobileErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "SUBSCRIPTION_LOCKED"
  | "CONFIGURATION_ERROR"
  | "INTERNAL_ERROR";

export function mobileSuccess<T>(data: T, init?: { status?: number; meta?: Record<string, unknown> }) {
  return NextResponse.json({ success: true, data, meta: init?.meta ?? {} }, { status: init?.status ?? 200 });
}

export function mobileError(
  code: MobileErrorCode | string,
  message: string,
  init?: { status?: number; details?: unknown },
) {
  return NextResponse.json(
    { success: false, error: { code, message, details: init?.details ?? null } },
    { status: init?.status ?? 400 },
  );
}

export function mobileValidationError(error: ZodError) {
  return mobileError("VALIDATION_ERROR", "Girilen bilgiler geçersiz.", {
    status: 400,
    details: error.flatten().fieldErrors,
  });
}

export function mobileSafeError(error: unknown, fallback = "İşlem şu anda tamamlanamadı.") {
  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") return mobileError("UNAUTHORIZED", "Oturumunuz geçersiz veya süresi dolmuş.", { status: 401 });
    if (error.message.startsWith("Missing permission")) return mobileError("FORBIDDEN", "Bu işlem için yetkiniz yok.", { status: 403 });
    if (error.message === "RATE_LIMITED") return mobileError("RATE_LIMITED", "Çok fazla istek yapıldı. Lütfen biraz sonra tekrar deneyin.", { status: 429 });
    if (error.message === "SUBSCRIPTION_LOCKED") return mobileError("SUBSCRIPTION_LOCKED", "Paketiniz bu işlem için uygun değil.", { status: 403 });
  }
  return mobileError("INTERNAL_ERROR", fallback, { status: 500 });
}
