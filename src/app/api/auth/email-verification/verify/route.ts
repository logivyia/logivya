import { NextResponse } from "next/server";

import { verifyEmailToken } from "@/server/auth/email-verification";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/u, "");
  if (!token || token.length < 32) return NextResponse.redirect(`${appUrl}/login?emailVerification=invalid`);
  try {
    await verifyEmailToken(request, token);
    return NextResponse.redirect(`${appUrl}/login?emailVerification=success`);
  } catch (error) {
    const reason = error instanceof Error && error.message === "EMAIL_VERIFICATION_EXPIRED" ? "expired" : "invalid";
    return NextResponse.redirect(`${appUrl}/login?emailVerification=${reason}`);
  }
}
