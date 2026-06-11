import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/session";

const authPaths = ["/login", "/register"];

export function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const isAuthPath = authPaths.some((path) => request.nextUrl.pathname.startsWith(path));
  if (!hasSession && !isAuthPath) return NextResponse.redirect(new URL("/login", request.url));
  if (hasSession && isAuthPath) return NextResponse.redirect(new URL("/dashboard", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/accounts/:path*", "/groups/:path*", "/categories/:path*", "/send-message/:path*", "/message-history/:path*", "/settings/:path*", "/login", "/register"],
};
