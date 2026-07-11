import { z } from "zod";
import { isBillingProfileComplete } from "@/server/billing/subscription-guard";
import { PURCHASABLE_PLAN_CODES } from "@/server/billing/plan-matrix";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({
  planSlug: z.enum(PURCHASABLE_PLAN_CODES),
  billingPeriod: z.enum(["MONTHLY", "YEARLY"]),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);

    const { company, user } = await requireMobileAuth(request);
    const [plan, profile] = await Promise.all([
      prisma.plan.findUnique({ where: { slug: parsed.data.planSlug } }),
      prisma.companyBillingProfile.findUnique({ where: { companyId: company.id } })
    ]);

    if (!plan) return mobileError("NOT_FOUND", "Plan bulunamadı.", { status: 404 });
    if (!isBillingProfileComplete(profile)) {
      return mobileError("BILLING_PROFILE_INCOMPLETE", "Yükseltme için şirket ve fatura bilgilerinizi tamamlayın.", { status: 400 });
    }

    const existing = await prisma.subscription.findFirst({
      where: { companyId: company.id, status: "MANUAL_PENDING", planId: plan.id }
    });

    if (!existing) {
      await prisma.subscription.create({
        data: {
          companyId: company.id,
          planId: plan.id,
          status: "MANUAL_PENDING",
          billingPeriod: parsed.data.billingPeriod,
          source: "MANUAL_ADMIN",
          provider: "MANUAL"
        }
      });
    }

    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "mobile.subscription.upgrade_requested",
      entityType: "Plan",
      entityId: plan.id,
      after: parsed.data
    });

    return mobileSuccess({ requested: true, message: "Paket yükseltme talebiniz alındı. Ekibimiz sizinle iletişime geçecektir." });
  } catch (error) {
    return mobileSafeError(error, "Paket yükseltme talebi oluşturulamadı.");
  }
}
