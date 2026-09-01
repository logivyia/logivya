import "server-only";
import { requireApiSession } from "@/server/auth/session";
import { requireMobileAuth } from "@/server/mobile/auth";
import { verifyPassword } from "@/server/security/passwords";
import { PrivacyError } from "@/server/privacy/errors";
import { assertWebMutationOrigin } from "@/server/security/request-origin";

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

export function assertPrivacyMutationCsrf(request: Request, authSource: "web" | "mobile") {
  // Only a successfully authenticated mobile context may opt out of web CSRF.
  if (authSource === "mobile") return;
  try { assertWebMutationOrigin(request); }
  catch { throw new PrivacyError("CSRF_REJECTED", 403); }
}

export async function requirePrivacyPassword(user: { passwordHash: string }, password: string | undefined) {
  if (!password || password.length > 256) throw new PrivacyError("RECENT_AUTHENTICATION_REQUIRED", 428);
  const valid = await verifyPassword(user.passwordHash, password, process.env.PASSWORD_PEPPER ?? "");
  if (!valid) throw new PrivacyError("RECENT_AUTHENTICATION_FAILED", 403);
}
