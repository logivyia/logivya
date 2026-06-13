import { NextResponse } from "next/server";
import { loginSchema } from "@/features/auth/schemas";
import { createSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/server/security/passwords";

export async function POST(request: Request) {
  const ipAddress=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown",userAgent=request.headers.get("user-agent");
  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "auth.invalidCredentials" }, { status: 400 });
  const identifier = parsed.data.identifier.trim().toLowerCase();
  const normalizedPhone = identifier.replace(/\D/g, "");
  const user = await prisma.user.findFirst({ where: { OR: [{ email: identifier }, ...(normalizedPhone.length >= 7 ? [{ phone: normalizedPhone }] : [])] } });
  if (!user || user.status !== "ACTIVE" || !(await verifyPassword(user.passwordHash, parsed.data.password, process.env.PASSWORD_PEPPER ?? ""))) {
    await prisma.loginAttempt.create({data:{userId:user?.id,email:identifier,ipAddress,userAgent,success:false,failureReason:"INVALID_CREDENTIALS"}});
    return NextResponse.json({ error: "auth.invalidCredentials" }, { status: 401 });
  }
  const membership = await prisma.companyUser.findFirst({ where: { userId: user.id, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!membership) return NextResponse.json({ error: "auth.workspaceUnavailable" }, { status: 403 });
  await createSession(user.id, membership.companyId, request);
  await prisma.loginAttempt.create({data:{userId:user.id,email:user.email,ipAddress,userAgent,success:true}});
  const admin=await prisma.platformAdmin.findUnique({where:{userId:user.id}});
  if(admin?.isActive){
    const trusted=await prisma.trustedDevice.findFirst({where:{userId:user.id,ipAddress,revokedAt:null}});
    const riskScore=trusted?0:35;
    await prisma.adminAccessLog.create({data:{userId:user.id,path:"/login",method:"POST",purpose:"ADMIN_LOGIN",permission:"platform:read",sensitive:true,ipAddress,userAgent}});
    await prisma.platformAdmin.update({where:{userId:user.id},data:{lastElevatedAt:new Date()}});
    await prisma.adminSessionEvent.create({data:{userId:user.id,type:"ADMIN_LOGIN",ipAddress,userAgent}});
    if(riskScore>20)await prisma.securityEvent.create({data:{userId:user.id,severity:"MEDIUM",type:"ADMIN_NEW_DEVICE_LOGIN",message:"Platform yöneticisi yeni IP veya cihazdan giriş yaptı.",ipAddress,userAgent,metadata:{riskScore}}});
  }
  return NextResponse.json({ ok: true });
}
