import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { startEmailStepUp } from "@/server/security/mfa-settings";

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    return mobileSuccess(await startEmailStepUp({ userId: context.user.id, companyId: context.company.id, channel: "MOBILE", request, deviceId: context.deviceId }));
  } catch (error) {
    return mobileSafeError(error);
  }
}
