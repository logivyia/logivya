import { subscriptionAccess } from "@/server/billing/subscription-access";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { requestCurrentAccountContactSync } from "@/server/whatsapp/contacts";

export async function POST(request: Request) {
  try {
    const { company, user } = await requireMobileAuth(request);
    if (!(await subscriptionAccess.canUseContactMessaging(company.id))) {
      return mobileError("CONTACT_MESSAGING_REQUIRES_PROFESSIONAL", "Kişilere mesaj göndermek için aktif bir abonelik gerekir.", { status: 403 });
    }
    const body = await request.json().catch(() => ({})) as { accountId?: string };
    await enforceOperationRateLimit({
      scope: "mobile-whatsapp-contact-sync",
      subject: `${company.id}:${user.id}:${body.accountId ?? "current"}`,
      maxAttempts: 12,
      windowMs: 60 * 60 * 1000,
      request,
    });
    const result = await requestCurrentAccountContactSync({ companyId: company.id, userId: user.id }, body.accountId, "mobile");
    return mobileSuccess({
      queued: !result.reused,
      accountId: result.account.id,
      jobId: result.jobId,
      syncRunId: result.syncRun.id,
      status: result.syncRun.status,
    }, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return mobileError("RATE_LIMITED", "Çok fazla kişi eşitleme isteği gönderdiniz. Lütfen daha sonra tekrar deneyin.", { status: 429 });
    }
    return mobileSafeError(error);
  }
}
