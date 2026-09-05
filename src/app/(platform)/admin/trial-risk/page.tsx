import { AdminTrialRiskPage } from "@/components/admin-trial-risk-page";
import { hasAdminPermission } from "@/server/auth/admin-permissions";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { platformAdmin } = await requirePlatformAdmin("admin.security.read");
  const params = await searchParams;
  const parsedPage = Number.parseInt(params.page || "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const pageSize = 50;
  const [items, total, blocked, review, active] = await Promise.all([
    prisma.trialEntitlement.findMany({
      include: {
        company: { select: { name: true } },
        user: { select: { email: true } },
        whatsappAccount: { select: { displayName: true, phoneNumber: true } },
      },
      orderBy: [{ riskScore: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.trialEntitlement.count(),
    prisma.trialEntitlement.count({ where: { status: "BLOCKED" } }),
    prisma.trialEntitlement.count({
      where: { status: { in: ["INELIGIBLE", "PENDING_IDENTITY"] } },
    }),
    prisma.trialEntitlement.count({ where: { status: "ACTIVE" } }),
  ]);
  return (
    <AdminTrialRiskPage
      canManage={hasAdminPermission(
        platformAdmin.role,
        platformAdmin.permissions,
        "admin.security.update",
      )}
      metrics={{ total, blocked, review, active }}
      pagination={{
        page,
        total,
        pages: Math.max(1, Math.ceil(total / pageSize)),
      }}
      items={items.map((item) => ({
        id: item.id,
        companyName: item.company.name,
        userEmail: item.user.email,
        accountName:
          item.whatsappAccount?.displayName ??
          item.whatsappAccount?.phoneNumber ??
          null,
        status: item.status,
        riskScore: item.riskScore,
        riskSignals: Array.isArray(item.riskSignals)
          ? item.riskSignals.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
        decisionCode: item.decisionCode,
        createdAt: item.createdAt.toISOString(),
      }))}
    />
  );
}
