import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/server/security/audit";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { readBoundedRequestText, RequestBodyError } from "@/server/security/request-body";
import { assertTrustedRequestOrigin } from "@/server/security/request-origin";
import { createOwnedTelegramAccount, listOwnedTelegramAccounts, requireOwnedTelegramAccount } from "@/server/telegram/accounts";
import { normalizeTelegramPhone } from "@/server/telegram/phone";
import { callTelegramWorker } from "@/server/telegram/worker-client";
import { requireWebTelegramAccess } from "@/server/web/communication-access";
import { webCommunicationSafeError } from "@/server/web/communication-response";

export const dynamic = "force-dynamic";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const auth = z.discriminatedUnion("step", [
  z.object({ step: z.literal("phone"), value: z.string().min(8).max(32) }),
  z.object({ step: z.literal("code"), value: z.string().trim().min(2).max(12) }),
  z.object({ step: z.literal("password"), value: z.string().min(1).max(256) }),
  z.object({ step: z.literal("email"), value: z.string().trim().email().max(254) }),
  z.object({ step: z.literal("email_code"), value: z.string().trim().min(2).max(16) }),
]);
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create") }).strict(),
  z.object({ action: z.literal("start"), accountId: id }).strict(),
  z.object({ action: z.literal("sync"), accountId: id }).strict(),
  z.object({ action: z.literal("auth"), accountId: id, auth }).strict(),
]);

function failure(code: string, message: string, status: number, retryAfterSeconds?: number) {
  return NextResponse.json({ ok: false, error: code, message, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) }, {
    status,
    headers: { "Cache-Control": "no-store", ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}) },
  });
}

function safeError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "CSRF_REJECTED") return failure(code, "İstek doğrulanamadı. Sayfayı yenileyip tekrar deneyin.", 403);
  if (error instanceof RequestBodyError) return failure(error.code, "Gönderilen bilgiler geçerli değil.", error.status);
  if (["PHONE_CODE_INVALID", "PASSWORD_HASH_INVALID", "EMAIL_CODE_INVALID"].includes(code)) {
    return failure("TELEGRAM_AUTH_INVALID", "Kod veya parola doğrulanamadı. Bilgilerinizi kontrol edip tekrar deneyin.", 400);
  }
  if (code === "PHONE_CODE_EXPIRED") return failure("TELEGRAM_CODE_EXPIRED", "Doğrulama kodunun süresi doldu. Telegram'daki güncel kodu kullanın.", 400);
  if (["TELEGRAM_PHONE_INVALID", "PHONE_NUMBER_INVALID", "EMAIL_ADDRESS_INVALID"].includes(code)) {
    return failure("VALIDATION_ERROR", "Telefon numarası veya e-posta adresi geçerli değil.", 400);
  }
  const flood = code.match(/(?:FLOOD_WAIT_?|retry after )(\d+)/i);
  if (flood) return failure("TELEGRAM_FLOOD_WAIT", "Telegram yeniden denemeden önce beklemenizi istiyor.", 429, Math.min(86400, Math.max(1, Number(flood[1]))));
  if (code === "PHONE_NUMBER_BANNED") return failure("TELEGRAM_PHONE_RESTRICTED", "Bu numara Telegram tarafından kısıtlandı. Hesabınızı Telegram uygulamasından kontrol edin.", 403);
  if (code.startsWith("TELEGRAM_AUTH_STATE_")) return failure("TELEGRAM_AUTH_STATE_CHANGED", "Doğrulama adımı değişti. Güncel adımla devam edin.", 409);
  if (code === "RATE_LIMITED") return failure(code, "Çok fazla deneme yapıldı. Bir dakika sonra tekrar deneyin.", 429, 60);
  if (error instanceof Error && ["TimeoutError", "AbortError", "TypeError"].includes(error.name)) {
    return failure("SERVICE_UNAVAILABLE", "Telegram bağlantısına şu anda ulaşılamıyor. Durumu yenileyip tekrar deneyin.", 503);
  }
  return webCommunicationSafeError(error);
}

export async function GET() {
  try {
    const { user, company } = await requireWebTelegramAccess();
    return NextResponse.json({ ok: true, accounts: await listOwnedTelegramAccounts(user.id, company.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return safeError(error); }
}

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const { user, company } = await requireWebTelegramAccess();
    await enforceOperationRateLimit({ scope: "telegram.web.connection", subject: `${company.id}:${user.id}`, maxAttempts: 20, windowMs: 60_000, request });
    const text = await readBoundedRequestText(request, 4096);
    let body: unknown;
    try { body = JSON.parse(text); } catch { return failure("VALIDATION_ERROR", "Gönderilen bilgiler geçerli değil.", 400); }
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) return failure("VALIDATION_ERROR", "Gönderilen bilgiler geçerli değil.", 400);
    const data = parsed.data;

    // The existing service owns deduplication, account ownership and TDLib sessions.
    // Only the cookie-authenticated web entry point is new.
    let accountId: string;
    let created = false;
    if (data.action === "create") {
      const result = await createOwnedTelegramAccount({ ownerUserId: user.id, companyId: company.id });
      accountId = result.account.id;
      created = result.created;
    } else {
      accountId = data.accountId;
      const account = await requireOwnedTelegramAccount(accountId, user.id, company.id);
      if (data.action === "sync" && (account.status !== "CONNECTED" || account.authState !== "READY")) throw new Error("TELEGRAM_ACCOUNT_NOT_READY");
    }

    const workerAction = data.action === "create" ? "start" : data.action;
    const payload = data.action === "auth"
      ? { step: data.auth.step, value: data.auth.step === "phone" ? normalizeTelegramPhone(data.auth.value) : data.auth.value }
      : {};
    const result = await callTelegramWorker<{ authState?: string; synced?: number; sendable?: number }>(`/accounts/${accountId}/${workerAction}`, {
      body: payload, ...(data.action === "sync" ? { timeoutMs: 60_000 } : {}),
    });
    // Never include submitted phone, verification code, password, or worker detail in audit data.
    await writeAuditLog(request, {
      companyId: company.id, userId: user.id,
      action: `telegram.web.${data.action === "auth" ? `auth.${data.auth.step}` : data.action}`,
      entityType: "TelegramAccount", entityId: accountId,
      after: { source: "WEB", created, authState: result.authState, synced: result.synced, sendable: result.sendable },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, accountId, accounts: await listOwnedTelegramAccounts(user.id, company.id), synced: result.synced, sendable: result.sendable }, {
      status: created ? 201 : 200, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) { return safeError(error); }
}
