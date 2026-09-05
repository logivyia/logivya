import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { profileInformationSchema } from "@/server/company/profile-information-schema";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

export async function GET() {
  try {
    const { company, user } = await requireApiSession();
    return NextResponse.json({ company: { name: company.name, email: user.email, phone: company.phone } });
  } catch { return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }); }
}

export async function PUT(request: Request) {
  try {
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "manage_company_settings");
    const parsed = profileInformationSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    const value = parsed.data;
    const before = { name: company.name, email: company.email, phone: company.phone };
    const updatedCompany = await prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id: company.id },
        data: {
          name: value.companyName,
          email: user.email,
          phone: value.phone?.replace(/\s/g, "") ?? null,
          address: null,
          city: null,
          district: null,
          postalCode: null,
          taxOffice: null,
          taxNumber: null,
        },
      });
      await tx.user.update({ where: { id: user.id }, data: { name: value.companyName } });
      return updated;
    });
    const profile = { name: updatedCompany.name, email: user.email, phone: updatedCompany.phone };
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "profile.updated", entityType: "Company", entityId: updatedCompany.id, before, after: profile });
    return NextResponse.json({ ok: true, company: profile });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 403 }); }
}
