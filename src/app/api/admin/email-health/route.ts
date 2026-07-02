import { NextResponse } from "next/server";
import { getEmailProviderStatus } from "@/lib/email/email-provider";
import { verifyEmailProviderConnection } from "@/lib/email/send-email";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { logger } from "@/server/observability/logger";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("platform:read", request);
    const status = getEmailProviderStatus();
    const connection = await verifyEmailProviderConnection();

    return NextResponse.json({
      ok: connection.ok,
      provider: status.provider,
      configured: status.configured,
      missingVariables: status.missingVariables,
      fromConfigured: status.fromConfigured,
      smtp: connection.smtp
        ? {
            host: connection.smtp.diagnostics.host,
            port: connection.smtp.diagnostics.port,
            secure: connection.smtp.diagnostics.secure,
            canConnect: connection.smtp.ok,
          }
        : undefined,
      reachable: connection.ok,
      error: connection.ok ? undefined : connection.errorCode,
    });
  } catch (error) {
    logger.error("Admin email health check failed", error);
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
}
