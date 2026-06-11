import { NextResponse } from "next/server";
import { loginSchema } from "@/features/auth/schemas";
import { createSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/server/security/passwords";

export async function POST(request: Request) {
  const ipAddress=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown",userAgent=request.headers.get("user-agent");
  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "auth.invalidCredentials" }, { status: 400 });
  const identifier = parsed.data.identifier.toLowerCase();
  const user = await prisma.user.findFirst({ where: { OR: [{ email: identifier }, { username: identifier }] } });
  if (!user || user.status !== "ACTIVE" || !(await verifyPassword(user.passwordHash, parsed.data.password, process.env.PASSWORD_PEPPER ?? ""))) {
    await prisma.loginAttempt.create({data:{userId:user?.id,email:identifier,ipAddress,userAgent,success:false,failureReason:"INVALID_CREDENTIALS"}});
    return NextResponse.json({ error: "auth.invalidCredentials" }, { status: 401 });
  }
  const membership = await prisma.companyUser.findFirst({ where: { userId: user.id, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!membership) return NextResponse.json({ error: "auth.workspaceUnavailable" }, { status: 403 });
  await createSession(user.id, membership.companyId, request);
  await prisma.loginAttempt.create({data:{userId:user.id,email:user.email,ipAddress,userAgent,success:true}});
  return NextResponse.json({ ok: true });
}
