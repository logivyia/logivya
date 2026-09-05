import { NextRequest, NextResponse } from "next/server";
import { normalizeCorrelationId } from "@logivya/logging";
import { SESSION_COOKIE } from "@/server/auth/session-cookie";
import { assertWebMutationOrigin } from "@/server/security/request-origin";

export function proxy(request: NextRequest) {
  const generatedRequestId = crypto.randomUUID();
  const requestId = normalizeCorrelationId(request.headers.get("x-request-id"), generatedRequestId);
  const correlationId = normalizeCorrelationId(request.headers.get("x-correlation-id"), requestId);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-correlation-id", correlationId);
  const withIds = (response: NextResponse) => {
    response.headers.set("x-request-id", requestId);
    response.headers.set("x-correlation-id", correlationId);
    return response;
  };
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const hasBearerToken = /^Bearer\s+\S+/i.test(request.headers.get("authorization") || "");
  const isProtected = ["/dashboard", "/accounts", "/groups", "/categories", "/send-message", "/messages", "/message-history", "/settings", "/support", "/activity", "/onboarding", "/admin"].some((path) => request.nextUrl.pathname.startsWith(path));
  if (process.env.MAINTENANCE_MODE === "true" && !request.nextUrl.pathname.startsWith("/admin") && isProtected) {
    return withIds(NextResponse.json({ error: "MAINTENANCE_MODE" }, { status: 503 }));
  }
  if (!hasSession && isProtected) return withIds(NextResponse.redirect(new URL("/login", request.url)));
  const isApiRequest = request.nextUrl.pathname.startsWith("/api/");
  if (request.nextUrl.pathname.startsWith("/api/admin/")) {
    if (!hasSession && !hasBearerToken) return withIds(NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }));
  }
  const isWebLogin = request.nextUrl.pathname === "/api/auth/login";
  if (isApiRequest && (hasSession || isWebLogin)) {
    // An Authorization header is not proof of bearer authentication. Web routes
    // may still authenticate the cookie, so it cannot disable this boundary.
    try { assertWebMutationOrigin(request); }
    catch { return withIds(NextResponse.json({ error: "CSRF_REJECTED" }, { status: 403 })); }
  }
  return withIds(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)"],
};
