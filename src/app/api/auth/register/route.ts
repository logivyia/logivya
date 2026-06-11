import { NextResponse } from "next/server";
import { registerSchema } from "@/features/auth/schemas";
import { createSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { hashPassword } from "@/server/security/passwords";

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "validation.invalid", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const input = parsed.data;
  const duplicate = await prisma.user.findFirst({ where: { OR: [{ email: input.email.toLowerCase() }, { username: input.username.toLowerCase() }] } });
  if (duplicate) return NextResponse.json({ error: "auth.accountExists" }, { status: 409 });
  const trial = await prisma.plan.findUnique({ where: { slug: "trial" } });
  if (!trial) return NextResponse.json({ error: "auth.trialUnavailable" }, { status: 503 });
  const passwordHash = await hashPassword(input.password, process.env.PASSWORD_PEPPER ?? "");
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: input.name, username: input.username.toLowerCase(), phone: input.phone, email: input.email.toLowerCase(), passwordHash, locale: "tr" },
    });
    const company = await tx.company.create({ data: { name: input.companyName, ownerId: user.id, email: user.email, phone: user.phone } });
    await tx.companyUser.create({ data: { companyId: company.id, userId: user.id, role: "OWNER" } });
    const now = new Date();
    await tx.subscription.create({
      data: { companyId: company.id, planId: trial.id, status: "TRIALING", trialStartsAt: now, trialEndsAt: new Date(now.getTime() + 14 * 86400000) },
    });
    return { user, company };
  });
  await createSession(result.user.id, result.company.id, request);
  return NextResponse.json({ ok: true }, { status: 201 });
}
