import { z } from "zod";

import { revokeUserSecuritySession } from "@/server/auth/device-sessions";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";

const paramsSchema = z.object({
  kind: z.enum(["WEB", "MOBILE"]),
  id: z.string().min(10).max(128),
});

export async function DELETE(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const context = await requireMobileAuth(request);
    const parsed = paramsSchema.safeParse(await params);
    if (!parsed.success) return mobileError("VALIDATION_ERROR", "Geçersiz oturum.", { status: 400 });
    const revoked = await revokeUserSecuritySession(context.user.id, parsed.data.kind, parsed.data.id);
    if (!revoked) return mobileError("NOT_FOUND", "Oturum bulunamadı.", { status: 404 });
    const currentRevoked = parsed.data.kind === "MOBILE" && parsed.data.id === context.sessionId;
    await writeAuditLog(request, {
      companyId: context.company.id,
      userId: context.user.id,
      action: "AUTH_DEVICE_SESSION_REVOKED",
      entityType: parsed.data.kind === "WEB" ? "UserSession" : "MobileDeviceSession",
      entityId: parsed.data.id,
      after: { currentRevoked },
    });
    return mobileSuccess({ ok: true, currentRevoked });
  } catch (error) {
    return mobileSafeError(error, "Oturum kapatılamadı.");
  }
}
