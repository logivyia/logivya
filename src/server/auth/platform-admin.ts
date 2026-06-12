import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export const ADMIN_ROLE_PERMISSIONS={
  SUPER_ADMIN:["*"],PLATFORM_ADMIN:["platform:read","companies:manage","users:manage","operations:manage"],
  SECURITY_ADMIN:["platform:read","security:read","security:manage","audit:read"],
  COMPLIANCE_ADMIN:["platform:read","compliance:read","data_requests:manage","audit:read"],
  BILLING_ADMIN:["platform:read","billing:read","billing:manage"],
  SUPPORT_ADMIN:["platform:read","support:read","support:manage"],
  OPERATIONS_ADMIN:["platform:read","operations:read","operations:manage","companies:read"],
  READ_ONLY_ADMIN:["platform:read"],
} as const;

function envAdmins(){return(process.env.PLATFORM_ADMIN_EMAILS??"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean)}
export async function requirePlatformAdmin(permission="platform:read",request?:Request){
  const context=await requireApiSession();
  const record=await prisma.platformAdmin.findUnique({where:{userId:context.user.id}});
  const fallback=envAdmins().includes(context.user.email.toLowerCase());
  if(!fallback&&(!record||!record.isActive))throw new Error("FORBIDDEN");
  const permissions=record?.permissions.length?record.permissions:[...(ADMIN_ROLE_PERMISSIONS[record?.role??"SUPER_ADMIN"]??[])];
  if(!fallback&&!permissions.includes("*")&&!permissions.includes(permission))throw new Error("FORBIDDEN");
  if(request)await prisma.adminAccessLog.create({data:{userId:context.user.id,path:new URL(request.url).pathname,method:request.method,permission,ipAddress:request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),userAgent:request.headers.get("user-agent")}});
  return{...context,platformAdmin:record??{role:"SUPER_ADMIN" as const,permissions:["*"],isActive:true,requiresMfa:true}};
}

export async function requireCriticalAdminAction(request:Request,permission:string,reason?:string){
  const context=await requirePlatformAdmin(permission,request);
  const value=reason?.trim()||request.headers.get("x-admin-reason")?.trim();
  if(!value||value.length<5)throw new Error("ADMIN_REASON_REQUIRED");
  if(context.platformAdmin.requiresMfa){
    const mfa=await prisma.mfaCredential.findFirst({where:{userId:context.user.id,verifiedAt:{not:null},revokedAt:null}});
    if(!mfa)throw new Error("ADMIN_MFA_REQUIRED");
  }
  return context;
}
