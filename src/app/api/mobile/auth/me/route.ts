import { hasPermission, PERMISSIONS } from "@/server/auth/permissions";
import { isAuthorizedLogivyaPlatformAdmin } from "@/server/auth/platform-owner";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";

export async function GET(request: Request) {
  try {
    const { user, company, membership } = await requireMobileAuth(request);
    const isPlatformAdmin = isAuthorizedLogivyaPlatformAdmin({ email: user.email });
    return mobileSuccess({
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, locale: user.locale, timezone: user.timezone, role: membership.role, isPlatformAdmin },
      company: { id: company.id, name: company.name, defaultLanguage: company.defaultLanguage, defaultTimezone: company.defaultTimezone },
      role: membership.role,
      isAdmin: isPlatformAdmin,
      isPlatformAdmin,
      permissions: PERMISSIONS.filter((permission) => hasPermission(membership.role, permission)),
    });
  } catch (error) {
    return mobileSafeError(error);
  }
}
