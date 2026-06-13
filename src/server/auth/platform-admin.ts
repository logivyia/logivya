import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function requirePlatformAdmin(permission = "platform:read", request?: Request) {
  const context = await requireApiSession();
  const record = await prisma.platformAdmin.findUnique({ where: { userId: context.user.id } });

  if (!record?.isActive || record.role !== "SUPER_ADMIN") throw new Error("FORBIDDEN");

  if (request) {
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
  if(context.platformAdmin.requiresMfa){
    const mfa=await prisma.mfaCredential.findFirst({where:{userId:context.user.id,verifiedAt:{not:null},revokedAt:null}});
    if(!mfa)throw new Error("ADMIN_MFA_REQUIRED");
    const elevated=context.platformAdmin.lastElevatedAt;
    if(!elevated||elevated<new Date(Date.now()-10*60_000))throw new Error("ADMIN_MFA_CONFIRMATION_REQUIRED");
  }
  return context;
}
