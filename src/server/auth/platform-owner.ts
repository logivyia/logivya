import type { PlatformAdminRole } from "@prisma/client";

export const LOGIVYA_PLATFORM_OWNER_EMAIL = "burakidim@gmail.com";

export function isLogivyaPlatformOwnerEmail(email?: string | null) {
  return email?.trim().toLowerCase() === LOGIVYA_PLATFORM_OWNER_EMAIL;
}

export function isAuthorizedLogivyaPlatformAdmin(input: {
  email?: string | null;
  role?: PlatformAdminRole | string | null;
  isActive?: boolean | null;
}) {
  return isLogivyaPlatformOwnerEmail(input.email);
}
