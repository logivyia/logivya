import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { requestCurrentAccountContactSync } from "@/server/whatsapp/contacts";

export async function POST(request: Request) {
  try {
    const { company, user } = await requireApiSession();
    if (!(await subscriptionAccess.canUseContactMessaging(company.id))) {
      return NextResponse.json({ error: "CONTACT_MESSAGING_REQUIRES_PROFESSIONAL", message: "Kişilere mesaj gönderimi Profesyonel paketinde kullanılabilir." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({})) as { accountId?: string };
    await enforceOperationRateLimit({
      scope: "whatsapp-contact-sync",
      subject: `${company.id}:${user.id}:${body.accountId ?? "current"}`,
      maxAttempts: 12,
      windowMs: 60 * 60 * 1000,
      request,
    });
    const result = await requestCurrentAccountContactSync({ companyId: company.id, userId: user.id }, body.accountId, "web");
    return NextResponse.json({ queued: true, accountId: result.account.id, jobId: result.job.id }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "errors.generic";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : message === "RATE_LIMITED" ? 429 : 409 });
  }
}
