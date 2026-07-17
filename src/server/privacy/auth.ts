import "server-only";
import { requireApiSession } from "@/server/auth/session";
import { requireMobileAuth } from "@/server/mobile/auth";
import { verifyPassword } from "@/server/security/passwords";
import { PrivacyError } from "@/server/privacy/errors";

function hasBearerToken(request: Request) {
  return /^Bearer\s+/i.test(request.headers.get("authorization") || "");
}

export async function requirePrivacyAuth(request: Request) {
  if (hasBearerToken(request)) {
    const context = await requireMobileAuth(request);
    return { ...context, authSource: "mobile" as const, platform: context.platform };
  }
  const context = await requireApiSession();
  return { ...context, authSource: "web" as const, platform: "WEB" as const };
}

export function assertPrivacyMutationCsrf(request: Request) {
  if (hasBearerToken(request) || !["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) throw new PrivacyError("CSRF_REJECTED", 403);
}

export async function requirePrivacyPassword(user: { passwordHash: string }, password: string | undefined) {
  if (!password || password.length > 256) throw new PrivacyError("RECENT_AUTHENTICATION_REQUIRED", 428);
  const valid = await verifyPassword(user.passwordHash, password, process.env.PASSWORD_PEPPER ?? "");
  if (!valid) throw new PrivacyError("RECENT_AUTHENTICATION_FAILED", 403);
}
