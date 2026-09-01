import { requireMobileAuth } from "@/server/mobile/auth";
import {
  mobileError,
  mobileSafeError,
  mobileSuccess,
} from "@/server/mobile/response";
import { pendingMfaEnrollmentStatus } from "@/server/security/mfa";
import { listMfaMethodState } from "@/server/security/mfa-policy";

export async function GET(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const [methodState, setup] = await Promise.all([
      listMfaMethodState({
        userId: context.user.id,
        companyPolicy: context.company.mfaPolicy,
        role: context.membership.role,
        preferredMethod: context.user.preferredMfaMethod,
      }),
      pendingMfaEnrollmentStatus(context.user.id),
    ]);
    const enabled = methodState.methods.filter((method) => method.enabled);
    return mobileSuccess({
      enabled: enabled.length > 0,
      enabledAt: enabled[0]?.enabledAt,
      verifiedEmail: context.user.email,
      methods: methodState.methods,
      preferredMethod: methodState.preferredMethod,
      ...setup,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED")
      return mobileError("UNAUTHORIZED", "Oturum geçersiz.", { status: 401 });
    return mobileSafeError(error);
  }
}
