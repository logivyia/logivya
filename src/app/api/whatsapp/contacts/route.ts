import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { listOwnedWhatsAppContacts } from "@/server/whatsapp/contacts";

export async function GET(request: Request) {
  try {
    const { company, user } = await requireApiSession();
    if (!(await subscriptionAccess.canUseContactMessaging(company.id))) {
      return NextResponse.json({ error: "CONTACT_MESSAGING_REQUIRES_PROFESSIONAL", message: "Kişilere mesaj göndermek için aktif bir abonelik gerekir." }, { status: 403 });
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
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "errors.generic";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : message.includes("OWNERSHIP") ? 403 : 409 });
  }
}
