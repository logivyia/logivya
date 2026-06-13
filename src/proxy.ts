import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/session";

const authPaths = ["/login", "/register", "/forgot-password", "/reset-password"];

export function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const isAuthPath = authPaths.some((path) => request.nextUrl.pathname.startsWith(path));
  const isProtected = ["/dashboard", "/accounts", "/groups", "/categories", "/send-message", "/messages", "/message-history", "/settings", "/support", "/activity", "/onboarding", "/admin"].some((path) => request.nextUrl.pathname.startsWith(path));
  if (process.env.MAINTENANCE_MODE === "true" && !request.nextUrl.pathname.startsWith("/admin") && isProtected) {
    return NextResponse.json({ error: "MAINTENANCE_MODE" }, { status: 503 });
  }
  if (!hasSession && isProtected) return NextResponse.redirect(new URL("/login", request.url));
  if (hasSession && isAuthPath) return NextResponse.redirect(new URL("/dashboard", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/accounts/:path*", "/groups/:path*", "/categories/:path*", "/send-message/:path*", "/messages/:path*", "/message-history/:path*", "/settings/:path*", "/support/:path*", "/activity/:path*", "/onboarding/:path*", "/admin/:path*", "/login", "/register", "/forgot-password", "/reset-password"],
};
