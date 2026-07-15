import "server-only";
import { redirect } from "next/navigation";
import type { PlatformAdminRole } from "@prisma/client";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { hasAdminPermission, isCriticalAdminPermission, normalizeAdminPermission } from "@/server/auth/admin-permissions";
import { isAuthorizedLogivyaPlatformAdmin } from "@/server/auth/platform-owner";
import { requireMobileAuth, type MobileAuthContext } from "@/server/mobile/auth";
import { assertAdminCsrf, enforceAdminRateLimit } from "@/server/security/admin-request";
import { requestNetworkSummary } from "@/server/observability/privacy";
import { tryRecordSecurityEvent } from "@/server/security/events";

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

type WebAdminAuthContext = Awaited<ReturnType<typeof requireApiSession>> & {
  authSource: "web";
  sessionCreatedAt: Date;
};

type MobileAdminAuthContext = MobileAuthContext & {
  authSource: "mobile";
  sessionCreatedAt: Date;
};

type PlatformAdminAuthContext = WebAdminAuthContext | MobileAdminAuthContext;

function hasBearerToken(request?: Request) {
  return /^Bearer\s+/i.test(request?.headers.get("authorization") || "");
}

async function readPlatformAdminAuthContext(request?: Request): Promise<PlatformAdminAuthContext> {
  if (!request || !hasBearerToken(request)) {
    const context = await requireApiSession();
    return { ...context, authSource: "web", sessionCreatedAt: context.session.createdAt };
  }

  const context = await requireMobileAuth(request);
  return { ...context, authSource: "mobile", sessionCreatedAt: context.sessionCreatedAt };
}

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

function createOwnerPlatformAdminRecord(userId: string, lastElevatedAt: Date): PlatformAdminAccessRecord {
  return {
    id: "logivya-platform-owner",
    userId,
    role: "SUPER_ADMIN",
    isActive: true,
    permissions: [],
    requiresMfa: false,
    lastElevatedAt,
  };
}

async function writeAdminAccessDeniedEvent(context: PlatformAdminAuthContext, permission: string, request?: Request) {
  await tryRecordSecurityEvent({
    request,
    companyId: context.company.id,
    userId: context.user.id,
    severity: "HIGH",
    type: "ADMIN_ACCESS_DENIED",
    message: "Unauthorized administrator access was denied.",
    result: "DENIED",
    source: "platform-admin-guard",
    metadata: {
      permission: normalizeAdminPermission(permission),
      route: request ? new URL(request.url).pathname : undefined,
    },
  });
}

export async function requirePlatformAdmin(permission = "admin.dashboard.read", request?: Request) {
  let context: PlatformAdminAuthContext;
  try {
    context = await readPlatformAdminAuthContext(request);
  } catch (error) {
    if (!request) redirect("/login?next=/admin");
    throw error;
  }

  const storedRecord = await readPlatformAdminAccessRecord(context.user.id);
  const record = isAuthorizedLogivyaPlatformAdmin({ email: context.user.email })
    ? (storedRecord ?? createOwnerPlatformAdminRecord(context.user.id, context.sessionCreatedAt))
    : storedRecord;

  if (!isAuthorizedLogivyaPlatformAdmin({ email: context.user.email }) || !record || !hasAdminPermission(record.role, record.permissions, permission)) {
    await writeAdminAccessDeniedEvent(context, permission, request);
    if (!request) redirect("/dashboard");
    throw new Error("FORBIDDEN");
  }
  if (context.sessionCreatedAt < new Date(Date.now() - ADMIN_SESSION_MAX_MS)) {
    if (!request) redirect("/login?next=/admin");
    throw new Error("UNAUTHORIZED");
  }

  if (request) {
    if (context.authSource === "web") assertAdminCsrf(request);
    await enforceAdminRateLimit(request, context.user.id, normalizeAdminPermission(permission));
    if (isCriticalAdminPermission(permission) && (!record.lastElevatedAt || record.lastElevatedAt < new Date(Date.now() - RECENT_AUTH_MAX_MS))) {
      throw new Error("ADMIN_RECENT_AUTH_REQUIRED");
    }
    const network = requestNetworkSummary(request);
    const normalizedPermission = normalizeAdminPermission(permission);
    const sensitive = /audit|security|payment|backup|restore|data|compliance/i.test(normalizedPermission);
    await prisma.adminAccessLog.create({
      data: {
        userId: context.user.id,
        path: new URL(request.url).pathname,
        method: request.method,
        purpose: sensitive ? "SENSITIVE_ADMIN_READ_OR_MUTATION" : "ADMIN_ACCESS",
        permission: normalizedPermission,
        sensitive,
        ipAddress: network.ipAddressMasked,
        userAgent: network.userAgentSummary,
      },
    });
  }

  return { ...context, platformAdmin: record };
}

export async function requireSuperAdmin(request?: Request) {
  return requirePlatformAdmin("platform:read", request);
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
