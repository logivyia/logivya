import { z } from "zod";

import { createMobileSession, requireMobileAuth } from "@/server/mobile/auth";
import { prisma } from "@/server/db";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { isMobileWorkspaceEnrollmentAllowed } from "@/server/mobile/registration-policy";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { acceptCompanyInvitation, companyInvitationErrorStatus } from "@/server/team/company-invitations";

const schema = z.object({ code: z.string().trim().min(16).max(32) });

const invitationMessages: Record<string, string> = {
  INVITATION_INVALID: "Davet kodu geçersiz.",
  INVITATION_EXPIRED: "Davet kodunun süresi dolmuş.",
  INVITATION_EMAIL_MISMATCH: "Bu davet farklı bir e-posta adresine ait.",
  INVITATION_ALREADY_USED: "Bu davet daha önce kullanılmış.",
  INVITATION_REVOKED: "Bu davet iptal edilmiş.",
  INVITATION_DECLINED: "Bu davet daha önce reddedilmiş.",
  SEAT_LIMIT_REACHED: "Çalışma alanında kullanılabilir hesap kapasitesi kalmamış.",
  RATE_LIMITED: "Çok fazla deneme yaptınız. Lütfen daha sonra tekrar deneyin.",
};

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    if (!isMobileWorkspaceEnrollmentAllowed(context.platform)) {
      return mobileError("WORKSPACE_ENROLLMENT_UNAVAILABLE_ON_IOS", "iOS uygulamasında davetle çalışma alanına katılma kullanılamaz.", { status: 403 });
    }
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return mobileValidationError(parsed.error);

    await enforceOperationRateLimit({
      scope: "mobile-company-invitation-code-accept",
      subject: `${context.user.id}:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"}`,
      maxAttempts: 12,
      windowMs: 60 * 60 * 1000,
      request,
    });

    const result = await acceptCompanyInvitation({ code: parsed.data.code, userId: context.user.id, email: context.user.email }, request);
    const tokens = await createMobileSession({
      userId: context.user.id,
      companyId: result.companyId,
      role: result.membership.role,
      deviceId: context.deviceId,
      platform: context.platform,
      userAgent: request.headers.get("user-agent"),
    });
    await prisma.mobileDeviceSession.updateMany({ where: { id: context.sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
    return mobileSuccess({ status: "ACCEPTED" as const, companyId: result.companyId, role: result.membership.role, tokens });
  } catch (error) {
    if (error instanceof Error && invitationMessages[error.message]) {
      return mobileError(error.message, invitationMessages[error.message], { status: companyInvitationErrorStatus(error.message) });
    }
    return mobileSafeError(error, "Davet kodu kabul edilemedi.");
  }
}
