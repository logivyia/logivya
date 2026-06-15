import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { serializeSubscription } from "@/server/mobile/subscription";

export async function GET(request: Request) {
  try {
    const { company } = await requireMobileAuth(request);
    const subscription = await prisma.subscription.findFirst({ where: { companyId: company.id }, include: { plan: true }, orderBy: { createdAt: "desc" } });
    return mobileSuccess({ subscription: serializeSubscription(subscription) });
  } catch (error) {
    return mobileSafeError(error);
  }
}
