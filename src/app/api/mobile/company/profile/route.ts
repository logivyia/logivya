import { z } from "zod";
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
  email: optionalText(254).refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "invalidEmail"),
  phone: optionalText(40),
  address: optionalText(500),
  taxOffice: optionalText(120),
  taxNumber: optionalText(80),
  city: optionalText(120),
  district: optionalText(120),
  country: optionalText(120),
  postalCode: optionalText(40),
});

function serializeCompany(company: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  city: string | null;
  district: string | null;
  defaultCountry: string;
  postalCode: string | null;
}) {
  return {
    id: company.id,
    name: company.name,
    email: company.email,
    phone: company.phone,
    address: company.address,
    taxOffice: company.taxOffice,
    taxNumber: company.taxNumber,
    city: company.city,
    district: company.district,
    country: company.defaultCountry,
    postalCode: company.postalCode,
  };
}

export async function GET(request: Request) {
  try {
    const { company } = await requireMobileAuth(request);
    return mobileSuccess({ company: serializeCompany(company) });
  } catch (error) {
    return mobileSafeError(error, "Sirket bilgileri alinamadi.");
  }
}

export async function PUT(request: Request) {
  try {
    const { company, user } = await requireMobileAuth(request);
    const parsed = companyProfileSchema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);

    const updatedCompany = await prisma.company.update({
      where: { id: company.id },
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        address: parsed.data.address,
        taxOffice: parsed.data.taxOffice,
        taxNumber: parsed.data.taxNumber,
        city: parsed.data.city,
        district: parsed.data.district,
        defaultCountry: parsed.data.country || "TR",
        postalCode: parsed.data.postalCode,
      },
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

    return mobileSuccess({ success: true, company: serializeCompany(updatedCompany) });
  } catch (error) {
    logger.error("mobile.company.profile.update_failed", error);
    return mobileSafeError(error, "Sirket bilgileri kaydedilemedi.");
  }
}
