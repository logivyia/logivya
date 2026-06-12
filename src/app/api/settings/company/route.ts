import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({
  companyName: z.string().trim().min(2).max(160),
  phone: z.string().trim().regex(/^\+?[0-9\s()-]{7,30}$/, "validation.phone"),
  address: z.string().trim().min(5).max(500),
  taxOffice: z.string().trim().min(2).max(120),
  taxNumber: z.string().trim().regex(/^\d{8,15}$/, "validation.numeric"),
  city: z.string().trim().min(2).max(120),
  district: z.string().trim().max(120).optional().default(""),
  country: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().max(20).optional().default(""),
});

export async function GET() {
  try {
    const { company } = await requireApiSession();
    const billing = await prisma.companyBillingProfile.findUnique({ where: { companyId: company.id } });
    return NextResponse.json({ company: { name: company.name, phone: company.phone, address: company.address, taxOffice: company.taxOffice, taxNumber: company.taxNumber }, billing });
  } catch { return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }); }
}

export async function PUT(request: Request) {
  try {
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "manage_company_settings");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    const value = parsed.data;
    const before = await prisma.companyBillingProfile.findUnique({ where: { companyId: company.id } });
    const billing = await prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { id: company.id }, data: { name: value.companyName, phone: value.phone.replace(/\s/g, ""), address: value.address, taxOffice: value.taxOffice, taxNumber: value.taxNumber } });
      return tx.companyBillingProfile.upsert({
        where: { companyId: company.id },
        update: { companyName: value.companyName, legalName: value.companyName, taxOffice: value.taxOffice, taxNumber: value.taxNumber, country: value.country, city: value.city, district: value.district, addressLine1: value.address, postalCode: value.postalCode, billingPhone: value.phone },
        create: { companyId: company.id, billingType: "COMPANY", companyName: value.companyName, legalName: value.companyName, taxOffice: value.taxOffice, taxNumber: value.taxNumber, country: value.country, city: value.city, district: value.district, addressLine1: value.address, postalCode: value.postalCode, billingEmail: company.email || user.email, billingPhone: value.phone, invoiceType: "STANDARD_INVOICE" },
      });
    });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "company.settings.updated", entityType: "CompanyBillingProfile", entityId: billing.id, before: before ?? {}, after: billing });
    return NextResponse.json({ ok: true, billing });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 403 }); }
}
