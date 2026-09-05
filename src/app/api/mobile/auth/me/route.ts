import { hasPermission, PERMISSIONS } from "@/server/auth/permissions";
import { getPlatformAdminProfile } from "@/server/auth/platform-admin";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";

export async function GET(request: Request) {
  try {
    const { user, company, membership } = await requireMobileAuth(request);
    const platformAdmin = await getPlatformAdminProfile({
      userId: user.id,
      email: user.email,
    });
    const { isPlatformAdmin } = platformAdmin;
    return mobileSuccess({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        locale: user.locale,
        timezone: user.timezone,
        role: membership.role,
        isPlatformAdmin,
      },
      company: {
        id: company.id,
        name: company.name,
        defaultLanguage: company.defaultLanguage,
        defaultTimezone: company.defaultTimezone,
      },
      role: membership.role,
      isAdmin: isPlatformAdmin,
      isPlatformAdmin,
      platformAdminRole: platformAdmin.platformAdminRole,
      adminPermissions: platformAdmin.adminPermissions,
      permissions: PERMISSIONS.filter((permission) =>
        hasPermission(membership.role, permission),
      ),
    });
  } catch (error) {
    return mobileSafeError(error);
  }
}
