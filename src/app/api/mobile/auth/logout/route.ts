import { z } from "zod";
import { requireMobileAuth, revokeRefreshToken } from "@/server/mobile/auth";
import { revokeCurrentSessionPushDevices } from "@/server/mobile/push";
import { mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({ refreshToken: z.string().min(20) });

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    await revokeRefreshToken(parsed.data.refreshToken);
    await revokeCurrentSessionPushDevices(context);
    await writeAuditLog(request, { companyId: context.company.id, userId: context.user.id, action: "mobile.auth.logout", entityType: "MobileDeviceSession", entityId: context.sessionId });
    return mobileSuccess({ ok: true });
  } catch (error) {
    return mobileSafeError(error, "Çıkış yapılamadı.");
  }
}
