import { z } from "zod";

import { createMobileSession, requireMobileAuth } from "@/server/mobile/auth";
import { prisma } from "@/server/db";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { isMobileWorkspaceEnrollmentAllowed } from "@/server/mobile/registration-policy";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { writeAuditLog } from "@/server/security/audit";
import { acceptCompanyInvitation, companyInvitationErrorStatus, declineCompanyInvitation } from "@/server/team/company-invitations";

const schema = z.object({ action: z.enum(["ACCEPT", "DECLINE"]).default("ACCEPT") });

export async function POST(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  try {
    const { identifier } = await params;
    const context = await requireMobileAuth(request);
    await enforceOperationRateLimit({
      scope: "mobile-company-invitation-accept",
      subject: `${context.user.id}:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"}`,
      maxAttempts: 12,
      windowMs: 60 * 60 * 1000,
      request,
    });
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return mobileValidationError(parsed.error);
    if (parsed.data.action === "DECLINE") {
      const invitation = await declineCompanyInvitation({ token: identifier, userId: context.user.id, email: context.user.email });
      await writeAuditLog(request, {
        companyId: invitation.companyId,
        userId: context.user.id,
        action: "mobile.company.invitation.declined",
        entityType: "CompanyInvitation",
        entityId: invitation.id,
      });
      return mobileSuccess({ status: "DECLINED" as const });
    }

    if (!isMobileWorkspaceEnrollmentAllowed(context.platform)) {
      return mobileError("WORKSPACE_ENROLLMENT_UNAVAILABLE_ON_IOS", "iOS uygulamasında davetle çalışma alanına katılma kullanılamaz.", { status: 403 });
    }

    const result = await acceptCompanyInvitation({ token: identifier, userId: context.user.id, email: context.user.email }, request);
    const tokens = await createMobileSession({
      userId: context.user.id,
      companyId: result.companyId,
      role: result.membership.role,
      deviceId: context.deviceId,
      platform: context.platform,
      userAgent: request.headers.get("user-agent"),
    });
    await prisma.mobileDeviceSession.updateMany({ where: { id: context.sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAuditLog(request, {
      companyId: result.companyId,
      userId: context.user.id,
      action: "mobile.company.invitation.accepted",
      entityType: "CompanyInvitation",
      entityId: result.invitation.id,
      after: { role: result.membership.role },
    });
    return mobileSuccess({ status: "ACCEPTED" as const, companyId: result.companyId, role: result.membership.role, tokens });
  } catch (error) {
    if (error instanceof Error) {
      const messages: Record<string, string> = {
        INVITATION_INVALID: "Davet bulunamadı.",
        INVITATION_EXPIRED: "Davetin süresi dolmuş.",
        INVITATION_EMAIL_MISMATCH: "Bu davet farklı bir e-posta adresine ait.",
        INVITATION_ALREADY_USED: "Bu davet daha önce kullanılmış.",
        INVITATION_REVOKED: "Bu davet iptal edilmiş.",
        INVITATION_DECLINED: "Bu davet daha önce reddedilmiş.",
        SEAT_LIMIT_REACHED: "Çalışma alanında kullanılabilir hesap kapasitesi kalmamış.",
        RATE_LIMITED: "Çok fazla deneme yaptınız. Lütfen daha sonra tekrar deneyin.",
      };
      if (messages[error.message]) {
        return mobileError(error.message, messages[error.message], { status: companyInvitationErrorStatus(error.message) });
      }
    }
    return mobileSafeError(error);
  }
}
