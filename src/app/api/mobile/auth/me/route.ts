import { hasPermission, PERMISSIONS } from "@/server/auth/permissions";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";

export async function GET(request: Request) {
  try {
    const { user, company, membership } = await requireMobileAuth(request);
    return mobileSuccess({
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, locale: user.locale, timezone: user.timezone },
      company: { id: company.id, name: company.name, defaultLanguage: company.defaultLanguage, defaultTimezone: company.defaultTimezone },
      role: membership.role,
      permissions: PERMISSIONS.filter((permission) => hasPermission(membership.role, permission)),
    });
  } catch (error) {
    return mobileSafeError(error);
  }
}
