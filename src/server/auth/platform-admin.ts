import "server-only";
import { redirect } from "next/navigation";
import type { PlatformAdminRole } from "@prisma/client";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { hasAdminPermission, isCriticalAdminPermission, normalizeAdminPermission } from "@/server/auth/admin-permissions";
import { assertAdminCsrf, enforceAdminRateLimit } from "@/server/security/admin-request";

const ADMIN_SESSION_MAX_MS = 8 * 60 * 60_000;
const RECENT_AUTH_MAX_MS = 10 * 60_000;

type PlatformAdminAccessRecord = {
  id: string;
  userId: string;
  role: PlatformAdminRole;
  isActive: boolean;
  permissions: string[];
  requiresMfa: boolean;
  lastElevatedAt: Date | null;
};

async function readPlatformAdminAccessRecord(userId: string): Promise<PlatformAdminAccessRecord | null> {
  const record = await prisma.platformAdmin.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      role: true,
      isActive: true,
    },
  });

  if (!record) return null;

  let optionalFields: Partial<Pick<PlatformAdminAccessRecord, "permissions" | "requiresMfa" | "lastElevatedAt">> = {};
  try {
    optionalFields = await prisma.platformAdmin.findUnique({
      where: { userId },
      select: {
        permissions: true,
        requiresMfa: true,
        lastElevatedAt: true,
      },
    }) ?? {};
  } catch {
    // Older production databases may briefly miss newer admin hardening columns.
    // Keep SUPER_ADMIN access deterministic instead of crashing the admin shell.
    optionalFields = {};
  }

  return {
    ...record,
    permissions: Array.isArray(optionalFields.permissions) ? optionalFields.permissions : [],
    requiresMfa: optionalFields.requiresMfa ?? false,
    lastElevatedAt: optionalFields.lastElevatedAt ?? null,
  };
}

async function writeAdminAccessDeniedEvent(context: Awaited<ReturnType<typeof requireApiSession>>, permission: string, request?: Request) {
  await prisma.securityEvent.create({
    data: {
      userId: context.user.id,
      severity: "HIGH",
      type: "ADMIN_ACCESS_DENIED",
      message: "Unauthorized admin access was denied.",
      ipAddress: request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: request?.headers.get("user-agent"),
      metadata: {
        permission: normalizeAdminPermission(permission),
        path: request ? new URL(request.url).pathname : undefined,
      },
    },
  }).catch(() => undefined);
}

export async function requirePlatformAdmin(permission = "admin.dashboard.read", request?: Request) {
  let context: Awaited<ReturnType<typeof requireApiSession>>;
  try {
    context = await requireApiSession();
  } catch (error) {
    if (!request) redirect("/login?next=/admin");
    throw error;
  }

  const record = await readPlatformAdminAccessRecord(context.user.id);

  if (!record?.isActive || !hasAdminPermission(record.role, record.permissions, permission)) {
    await writeAdminAccessDeniedEvent(context, permission, request);
    if (!request) redirect("/dashboard");
    throw new Error("FORBIDDEN");
  }
  if (context.session.createdAt < new Date(Date.now() - ADMIN_SESSION_MAX_MS)) {
    if (!request) redirect("/login?next=/admin");
    throw new Error("UNAUTHORIZED");
  }

  if (request) {
    assertAdminCsrf(request);
    await enforceAdminRateLimit(request, context.user.id, normalizeAdminPermission(permission));
    if (isCriticalAdminPermission(permission) && (!record.lastElevatedAt || record.lastElevatedAt < new Date(Date.now() - RECENT_AUTH_MAX_MS))) {
      throw new Error("ADMIN_RECENT_AUTH_REQUIRED");
    }
    await prisma.adminAccessLog.create({
      data: {
        userId: context.user.id,
        path: new URL(request.url).pathname,
        method: request.method,
        permission,
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
        userAgent: request.headers.get("user-agent"),
      },
    });
  }

  return { ...context, platformAdmin: record };
}

export async function requireCriticalAdminAction(request:Request,permission:string,reason?:string){
  const context=await requirePlatformAdmin(permission,request);
  const value=reason?.trim()||request.headers.get("x-admin-reason")?.trim();
  if(!value||value.length<5)throw new Error("ADMIN_REASON_REQUIRED");
  const elevated=context.platformAdmin.lastElevatedAt;
  if(!elevated||elevated<new Date(Date.now()-RECENT_AUTH_MAX_MS))throw new Error("ADMIN_RECENT_AUTH_REQUIRED");
  if(process.env.ADMIN_2FA_REQUIRED==="true" && context.platformAdmin.requiresMfa){
    const mfa=await prisma.mfaCredential.findFirst({where:{userId:context.user.id,verifiedAt:{not:null},revokedAt:null}});
    if(!mfa)throw new Error("ADMIN_MFA_REQUIRED");
  }
  if(!isCriticalAdminPermission(permission))throw new Error("ADMIN_CRITICAL_PERMISSION_REQUIRED");
  return context;
}
