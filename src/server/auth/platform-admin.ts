import "server-only";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { hasAdminPermission, isCriticalAdminPermission, normalizeAdminPermission } from "@/server/auth/admin-permissions";
import { assertAdminCsrf, enforceAdminRateLimit } from "@/server/security/admin-request";

const ADMIN_SESSION_MAX_MS = 8 * 60 * 60_000;
const RECENT_AUTH_MAX_MS = 10 * 60_000;

export async function requirePlatformAdmin(permission = "admin.dashboard.read", request?: Request) {
  const context = await requireApiSession();
  const record = await prisma.platformAdmin.findUnique({ where: { userId: context.user.id } });

  if (!record?.isActive || !hasAdminPermission(record.role, record.permissions, permission)) {
    await prisma.securityEvent.create({ data: { userId: context.user.id, severity: "HIGH", type: "ADMIN_ACCESS_DENIED", message: "Unauthorized admin access was denied.", ipAddress: request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim(), userAgent: request?.headers.get("user-agent"), metadata: { permission: normalizeAdminPermission(permission), path: request ? new URL(request.url).pathname : undefined } } });
    throw new Error("FORBIDDEN");
  }
  if (context.session.createdAt < new Date(Date.now() - ADMIN_SESSION_MAX_MS)) throw new Error("UNAUTHORIZED");

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
