import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { registerSchema } from "@/features/auth/schemas";
import { createSession } from "@/server/auth/session";
import { ensureSevenDayTrial } from "@/server/billing/trial-service";
import { prisma } from "@/server/db";
import { hashPassword } from "@/server/security/passwords";

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
}

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "validation.invalid", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const input = parsed.data;
  const fullName = input.name.trim();
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedPhone = input.phone.replace(/\D/g, "");
  const defaultCompanyName = fullName ? `${fullName} Şirketi` : "Yeni Şirket";
  const ipAddress = clientIp(request);
  const userAgent = request.headers.get("user-agent");

  const duplicate = await prisma.user.findFirst({ where: { OR: [{ email: normalizedEmail }, { phone: normalizedPhone }] } });
  if (duplicate) return NextResponse.json({ error: "auth.accountExists" }, { status: 409 });

  const trial = await prisma.plan.findUnique({ where: { slug: "trial" } });
  if (!trial) return NextResponse.json({ error: "auth.trialUnavailable" }, { status: 503 });

  const passwordHash = await hashPassword(input.password, process.env.PASSWORD_PEPPER ?? "");
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: fullName,
        username: `user-${randomBytes(12).toString("hex")}`,
        phone: normalizedPhone,
        email: normalizedEmail,
        passwordHash,
        locale: "tr",
      },
    });

    const company = await tx.company.create({
      data: { name: defaultCompanyName, ownerId: user.id, email: user.email, phone: user.phone },
    });

    await tx.companyUser.create({ data: { companyId: company.id, userId: user.id, role: "OWNER" } });

    await ensureSevenDayTrial(tx, { companyId: company.id, planId: trial.id, userId: user.id });
    await tx.companyBillingProfile.create({
      data: {
        companyId: company.id,
        billingType: "COMPANY",
        companyName: company.name,
        country: "TR",
        city: "-",
        addressLine1: "-",
        billingEmail: user.email,
      },
    });
    await tx.onboardingChecklist.create({ data: { companyId: company.id } });
    await tx.consentRecord.createMany({
      data: [
        { userId: user.id, type: "TERMS_OF_SERVICE", version: "2026-06-12", granted: true, ipAddress, userAgent },
        { userId: user.id, type: "PRIVACY_POLICY", version: "2026-06-12", granted: true, ipAddress, userAgent },
        { userId: user.id, type: "KVKK", version: "2026-06-12", granted: true, ipAddress, userAgent },
      ],
    });

    if (input.referralCode) {
      const referral = await tx.referralCode.findFirst({ where: { code: input.referralCode, isActive: true } });
      if (referral) {
        await tx.referralSignup.create({
          data: { referralCodeId: referral.id, referredUserId: user.id, referredCompanyId: company.id },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: user.id,
        action: "workspace.registered",
        entityType: "Company",
        entityId: company.id,
        ipAddress,
        userAgent,
      },
    });

    return { user, company };
  });

  await createSession(result.user.id, result.company.id, request);
  return NextResponse.json({ ok: true }, { status: 201 });
}
