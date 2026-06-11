import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { hashPassword } from "@/server/security/passwords";
import { writeAuditLog } from "@/server/security/audit";
import { subscriptionAccess } from "@/server/billing/subscription-access";

const inviteSchema=z.object({name:z.string().min(2).max(100),email:z.string().email(),role:z.enum(["ADMIN","OPERATOR","VIEWER"])});

export async function GET() {
  try {
    const { company, membership } = await requireApiSession();
    if (!["OWNER", "ADMIN"].includes(membership.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const users = await prisma.companyUser.findMany({
      where: { companyId: company.id },
      include: { user: { select: { id: true, name: true, email: true, status: true, sessions: { select: { lastActiveAt: true }, orderBy: { lastActiveAt: "desc" }, take: 1 } } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return NextResponse.json({ users });
  } catch { return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }); }
}

export async function POST(request:Request){
  try{
    const{company,membership,user:actor}=await requireApiSession();
    if(!["OWNER","ADMIN"].includes(membership.role))return NextResponse.json({error:"FORBIDDEN"},{status:403});
    const parsed=inviteSchema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"validation.invalid"},{status:400});
    const access=await subscriptionAccess.canInviteUser(company.id);if(!access.allowed)return NextResponse.json({error:"users.planLimit",limit:access.limit},{status:403});
    const email=parsed.data.email.toLowerCase();
    let user=await prisma.user.findUnique({where:{email}});
    if(!user){
      const temporary=`Inv!${randomBytes(24).toString("base64url")}Aa1`;
      user=await prisma.user.create({data:{name:parsed.data.name,email,username:`invite-${randomBytes(8).toString("hex")}`,phone:null,passwordHash:await hashPassword(temporary,process.env.PASSWORD_PEPPER??""),status:"INVITED",locale:"tr"}});
    }
    const member=await prisma.companyUser.upsert({where:{companyId_userId:{companyId:company.id,userId:user.id}},update:{role:parsed.data.role,status:"INVITED"},create:{companyId:company.id,userId:user.id,role:parsed.data.role,status:"INVITED"}});
    await writeAuditLog(request,{companyId:company.id,userId:actor.id,action:"company.user.invited",entityType:"CompanyUser",entityId:member.id,after:{email,role:member.role}});
    return NextResponse.json({member},{status:201});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"errors.generic"},{status:403})}
}
