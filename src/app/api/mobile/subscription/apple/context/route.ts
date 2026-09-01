import { getApplePurchaseContext } from "@/server/billing/apple-subscriptions";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { company, user } = await requireMobileAuth(request);
    return mobileSuccess(await getApplePurchaseContext({ companyId: company.id, userId: user.id }));
  } catch (error) {
    return mobileSafeError(error, "Apple abonelik bilgileri alınamadı.");
  }
}
