import { listUserSecuritySessions, revokeAllUserSecuritySessions } from "@/server/auth/device-sessions";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";

export async function GET(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const sessions = await listUserSecuritySessions(context.user.id, { mobileSessionId: context.sessionId });
    return mobileSuccess({ sessions });
  } catch (error) {
    return mobileSafeError(error, "Oturumlar yuklenemedi.");
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const revoked = await revokeAllUserSecuritySessions(context.user.id);
    await writeAuditLog(request, {
      companyId: context.company.id,
      userId: context.user.id,
      action: "AUTH_LOGOUT_EVERYWHERE",
      entityType: "MobileDeviceSession",
      entityId: context.sessionId,
      after: revoked,
    });
    return mobileSuccess({ ok: true, revoked });
  } catch (error) {
    return mobileSafeError(error, "Oturumlar kapatilamadi.");
  }
}
