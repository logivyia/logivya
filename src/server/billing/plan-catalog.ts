import { canonicalSubscriptionPlanCatalog, serializeCanonicalSubscriptionPlan } from "@/config/subscription-plans";
import { prisma } from "@/server/db";

export async function getNormalizedPlanCatalog() {
  const persisted = await prisma.plan.findMany({
    where: { slug: { in: canonicalSubscriptionPlanCatalog().map((plan) => plan.slug) } },
    select: { id: true, slug: true, name: true, description: true },
  });
  const persistedBySlug = new Map(persisted.map((plan) => [plan.slug, plan]));

  return canonicalSubscriptionPlanCatalog().map((plan) => {
    const record = persistedBySlug.get(plan.slug);
    return {
      id: record?.id ?? plan.slug,
      name: record?.name ?? plan.slug,
      description: record?.description ?? null,
      ...serializeCanonicalSubscriptionPlan(plan),
    };
  });
}
