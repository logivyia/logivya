import { NextResponse } from "next/server";
import { registerSchema } from "@/features/auth/schemas";
import { createSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { hashPassword } from "@/server/security/passwords";
import { randomBytes } from "node:crypto";

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "validation.invalid", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const input = parsed.data;
  const normalizedPhone = input.phone.replace(/\D/g, "");
  const duplicate = await prisma.user.findFirst({ where: { OR: [{ email: input.email.toLowerCase() }, { phone: normalizedPhone }] } });
  if (duplicate) return NextResponse.json({ error: "auth.accountExists" }, { status: 409 });
  const trial = await prisma.plan.findUnique({ where: { slug: "trial" } });
  if (!trial) return NextResponse.json({ error: "auth.trialUnavailable" }, { status: 503 });
  const passwordHash = await hashPassword(input.password, process.env.PASSWORD_PEPPER ?? "");
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: input.name, username: `user-${randomBytes(12).toString("hex")}`, phone: normalizedPhone, email: input.email.toLowerCase(), passwordHash, locale: "tr" },
    });
    const company = await tx.company.create({ data: { name: input.companyName.trim() || `${input.name} Çalışma Alanı`, ownerId: user.id, email: user.email, phone: user.phone } });
    await tx.companyUser.create({ data: { companyId: company.id, userId: user.id, role: "OWNER" } });
    const now = new Date();
    const trialEndsAt=new Date(now.getTime() + 3 * 86400000);
    const subscription=await tx.subscription.create({ data: { companyId: company.id, planId: trial.id, status: "TRIALING",billingPeriod:"TRIAL",startsAt:now,endsAt:trialEndsAt,trialStartsAt:now,trialEndsAt,currentPeriodStartsAt:now,currentPeriodEndsAt:trialEndsAt,source:"TRIAL",provider:"MANUAL" } });
    await tx.subscriptionEvent.create({data:{companyId:company.id,subscriptionId:subscription.id,actorUserId:user.id,type:"TRIAL_STARTED",message:"3 günlük ücretsiz deneme başlatıldı."}});
    await tx.notification.create({data:{companyId:company.id,userId:user.id,type:"TRIAL_STARTED",title:"Deneme paketi başladı",message:"3 günlük ücretsiz denemeniz başladı."}});
    await tx.companyBillingProfile.create({ data: { companyId: company.id, billingType: "COMPANY", companyName: company.name, country: "TR", city: "-", addressLine1: "-", billingEmail: user.email } });
    await tx.onboardingChecklist.create({data:{companyId:company.id}});
    await tx.consentRecord.createMany({data:[
      {userId:user.id,type:"TERMS_OF_SERVICE",version:"2026-06-12",granted:true,ipAddress:request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),userAgent:request.headers.get("user-agent")},
      {userId:user.id,type:"PRIVACY_POLICY",version:"2026-06-12",granted:true,ipAddress:request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),userAgent:request.headers.get("user-agent")},
      {userId:user.id,type:"KVKK",version:"2026-06-12",granted:true,ipAddress:request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),userAgent:request.headers.get("user-agent")},
      ...(input.marketingAccepted?[{userId:user.id,type:"MARKETING" as const,version:"2026-06-12",granted:true,ipAddress:request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),userAgent:request.headers.get("user-agent")}]:[]),
    ]});
    if(input.referralCode){const referral=await tx.referralCode.findFirst({where:{code:input.referralCode,isActive:true}});if(referral)await tx.referralSignup.create({data:{referralCodeId:referral.id,referredUserId:user.id,referredCompanyId:company.id}})}
    await tx.auditLog.create({ data: { companyId: company.id, userId: user.id, action: "workspace.registered", entityType: "Company", entityId: company.id, ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(), userAgent: request.headers.get("user-agent") } });
    return { user, company };
  });
  await createSession(result.user.id, result.company.id, request);
  return NextResponse.json({ ok: true }, { status: 201 });
}
