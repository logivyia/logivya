import { subscriptionAccess } from "@/server/billing/subscription-access";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { listOwnedWhatsAppContacts } from "@/server/whatsapp/contacts";

export async function GET(request: Request) {
  try {
    const { company, user } = await requireMobileAuth(request);
    if (!(await subscriptionAccess.canUseContactMessaging(company.id))) {
      return mobileError("CONTACT_MESSAGING_REQUIRES_PROFESSIONAL", "Kişilere mesaj göndermek için aktif bir abonelik gerekir.", { status: 403 });
    }
    const url = new URL(request.url);
    const requestedSort = url.searchParams.get("sort");
    const sort = requestedSort === "name_desc" || requestedSort === "updated_desc" ? requestedSort : "name_asc";
    const result = await listOwnedWhatsAppContacts({
      companyId: company.id,
      userId: user.id,
      accountId: url.searchParams.get("accountId") || undefined,
      page: Number(url.searchParams.get("page") || 1),
      limit: Number(url.searchParams.get("limit") || 30),
      search: url.searchParams.get("search") || undefined,
      active: url.searchParams.get("active") !== "false",
      sort,
    });
    return mobileSuccess(result);
  } catch (error) {
    return mobileSafeError(error);
  }
}
