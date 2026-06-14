import { NextResponse } from "next/server";
import { verifySmtpConnection } from "@/lib/email/send-email";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { logger } from "@/server/observability/logger";

export async function GET() {
  try {
    await requirePlatformAdmin("platform:read");
    const result = await verifySmtpConnection();

    return NextResponse.json({
      ok: result.ok,
      provider: "SMTP",
      configured: result.diagnostics.configured,
      missing: result.diagnostics.missing,
      host: result.diagnostics.host,
      port: result.diagnostics.port,
      secure: result.diagnostics.secure,
      fromConfigured: result.diagnostics.fromConfigured,
      reachable: result.ok,
      error: result.ok ? undefined : result.errorCode,
    });
  } catch (error) {
    logger.error("Admin email health check failed", error);
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
}
