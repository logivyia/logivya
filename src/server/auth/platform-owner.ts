import type { PlatformAdminRole } from "@prisma/client";

export const LOGIVYA_PLATFORM_OWNER_EMAIL = (
  process.env.SUPER_ADMIN_EMAIL
  || process.env.INITIAL_PLATFORM_ADMIN_EMAIL
  || ""
).trim().toLowerCase();

export function requireLogivyaPlatformOwnerEmail() {
  if (!LOGIVYA_PLATFORM_OWNER_EMAIL) throw new Error("SUPER_ADMIN_EMAIL_REQUIRED");
  return LOGIVYA_PLATFORM_OWNER_EMAIL;
}

export function isLogivyaPlatformOwnerEmail(email?: string | null) {
  return Boolean(
    LOGIVYA_PLATFORM_OWNER_EMAIL
    && email?.trim().toLowerCase() === LOGIVYA_PLATFORM_OWNER_EMAIL,
  );
}

export function isAuthorizedLogivyaPlatformAdmin(input: {
  email?: string | null;
  role?: PlatformAdminRole | string | null;
  isActive?: boolean | null;
}) {
  return isLogivyaPlatformOwnerEmail(input.email);
}
