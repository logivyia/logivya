import { AdminTrialRiskPage } from "@/components/admin-trial-risk-page";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("admin.security.read");
  const items = await prisma.trialEntitlement.findMany({
    include: {
      company: { select: { name: true } },
      user: { select: { email: true } },
      whatsappAccount: { select: { displayName: true, phoneNumber: true } },
    },
    orderBy: [{ riskScore: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return <AdminTrialRiskPage items={items.map((item) => ({
    id: item.id,
    companyName: item.company.name,
    userEmail: item.user.email,
    accountName: item.whatsappAccount?.displayName ?? item.whatsappAccount?.phoneNumber ?? null,
    status: item.status,
    riskScore: item.riskScore,
    riskSignals: Array.isArray(item.riskSignals) ? item.riskSignals.filter((value): value is string => typeof value === "string") : [],
    decisionCode: item.decisionCode,
    createdAt: item.createdAt.toISOString(),
  }))} />;
}
