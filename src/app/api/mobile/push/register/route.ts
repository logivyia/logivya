import { requireMobileAuth } from "@/server/mobile/auth";
import { registerPushDevice, registerPushDeviceSchema, removePushDevice, removePushDeviceSchema } from "@/server/mobile/push";
import { mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";

export async function POST(request: Request) {
  try {
    const parsed = registerPushDeviceSchema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const context = await requireMobileAuth(request);
    const pushDevice = await registerPushDevice(context, parsed.data);
    await writeAuditLog(request, {
      companyId: context.company.id,
      userId: context.user.id,
      action: "mobile.push.registered",
      entityType: "MobilePushToken",
      entityId: pushDevice.id,
      after: { deviceId: pushDevice.deviceId, platform: pushDevice.platform }
    });
    return mobileSuccess({ registered: true, pushDevice });
  } catch (error) {
    return mobileSafeError(error, "Bildirim cihazı kaydedilemedi.");
  }
}

export async function DELETE(request: Request) {
  try {
    const parsed = removePushDeviceSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return mobileValidationError(parsed.error);
    const context = await requireMobileAuth(request);
    const revokedCount = await removePushDevice(context, parsed.data);
    await writeAuditLog(request, {
      companyId: context.company.id,
      userId: context.user.id,
      action: "mobile.push.removed",
      entityType: "MobilePushToken",
      entityId: context.deviceId,
      after: { revokedCount }
    });
    return mobileSuccess({ removed: true, revokedCount });
  } catch (error) {
    return mobileSafeError(error, "Bildirim cihazı kaldırılamadı.");
  }
}
