import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";
import { logger } from "@/server/observability/logger";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));

const companyProfileSchema = z.object({
  name: z.string().trim().min(1).max(160),
  phone: optionalText(40),
});

function serializeCompany(company: {
  id: string;
  name: string;
  phone: string | null;
}, email: string) {
  return {
    id: company.id,
    name: company.name,
    email,
    phone: company.phone,
  };
}

export async function GET(request: Request) {
  try {
    const { company, user } = await requireMobileAuth(request);
    return mobileSuccess({ company: serializeCompany(company, user.email) });
  } catch (error) {
    return mobileSafeError(error, "Profil bilgileri alınamadı.");
  }
}

export async function PUT(request: Request) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "manage_company_settings");
    const parsed = companyProfileSchema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);

    const updatedCompany = await prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id: company.id },
        data: {
          name: parsed.data.name,
          email: user.email,
          phone: parsed.data.phone,
          address: null,
          taxOffice: null,
          taxNumber: null,
          city: null,
          district: null,
          postalCode: null,
        },
      });
      await tx.user.update({ where: { id: user.id }, data: { name: parsed.data.name } });
      return updated;
    });

    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "mobile.company.profile.updated",
      entityType: "Company",
      entityId: company.id,
      after: { fields: Object.keys(parsed.data) },
    }).catch((auditError) =>
      logger.error("mobile.company.profile.audit_failed", auditError, {
        companyId: company.id,
      }),
    );

    return mobileSuccess({ success: true, company: serializeCompany(updatedCompany, user.email) });
  } catch (error) {
    logger.error("mobile.company.profile.update_failed", error);
    return mobileSafeError(error, "Profil bilgileri kaydedilemedi.");
  }
}
