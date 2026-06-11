import { NextResponse } from "next/server";
import { z } from "zod";
import { billingProfileSchema } from "@/features/billing/schemas";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({
  companyName: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().email(),
  website: z.string().url().optional().or(z.literal("")),
  billing: billingProfileSchema,
});

export async function GET() {
  try {
    const { company } = await requireApiSession();
    const billing = await prisma.companyBillingProfile.findUnique({ where: { companyId: company.id } });
    return NextResponse.json({ company: { name: company.name, phone: company.phone, email: company.email }, billing });
  } catch { return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }); }
}

export async function PUT(request: Request) {
  try {
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "manage_company_settings");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { billing, companyName, phone, email } = parsed.data;
    const before = await prisma.companyBillingProfile.findUnique({ where: { companyId: company.id } });
    const result = await prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { id: company.id }, data: { name: companyName, phone: phone || null, email } });
      return tx.companyBillingProfile.upsert({
        where: { companyId: company.id },
        update: billing,
        create: { ...billing, companyId: company.id },
      });
    });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "company.settings.updated", entityType: "CompanyBillingProfile", entityId: result.id, before: before ?? {}, after: result });
    return NextResponse.json({ ok: true, billing: result });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 403 }); }
}
