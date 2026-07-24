import { prisma } from "@/server/db";
import { resolveCompanyEntitlements, resolveCompanyEntitlementSummary } from "@/server/billing/company-entitlements";
import { evaluateMessageTargetAccess, type MessageTargetCounts } from "@/server/billing/message-target-access";

export const INACTIVE_SUBSCRIPTION_MESSAGE =
  "Aboneliginiz aktif degil. Mesaj gondermek veya yeni WhatsApp hesabi baglamak icin paketinizi yenileyin.";

const ACTIVE_SUBSCRIPTION_STATUSES = ["ACTIVE", "TRIALING"] as const;
void ACTIVE_SUBSCRIPTION_STATUSES;

export class SubscriptionAccessService {
  async getCurrent(companyId: string) {
    return resolveCompanyEntitlements(companyId);
  }

  async getSummary(companyId: string, actor?: { userId?: string; role?: string }) {
    return resolveCompanyEntitlementSummary(companyId, new Date(), actor);
  }

  async requireActive(companyId: string) {
    const current = await this.getCurrent(companyId);
    if (!current?.valid) throw new Error("subscription.inactive");
    return current;
  }

  async canConnectWhatsAppAccount(companyId: string, userId?: string) {
    const [current, used] = await Promise.all([
      this.getCurrent(companyId),
      prisma.whatsAppAccount.count({ where: { companyId, archivedAt: null } }),
    ]);
    if (current?.valid) {
      const limit = current.entitlements.whatsappConnections;
      return {
        allowed: used < limit,
        reason: used < limit ? undefined : "subscription.whatsappAccountLimit",
        limit,
        used,
      };
    }
    const pendingTrial = userId
      ? await prisma.trialEntitlement.findUnique({ where: { companyId_userId: { companyId, userId } }, select: { status: true } })
      : null;
    const bootstrapAllowed = pendingTrial?.status === "PENDING_IDENTITY" && used < 1;
    return {
      allowed: bootstrapAllowed,
      reason: bootstrapAllowed ? undefined : pendingTrial ? "trial.identityVerificationUnavailable" : "subscription.inactive",
      limit: pendingTrial?.status === "PENDING_IDENTITY" ? 1 : 0,
      used,
    };
  }

  async canSendMessage(companyId: string, requestedRecipients = 0) {
    const current = await this.getCurrent(companyId);
    if (!current?.valid) return { allowed: false, reason: "subscription.inactive", limit: undefined, used: 0 };

    return { allowed: true, limit: undefined, used: requestedRecipients };
  }

  async canSendTargets(companyId: string, targets: MessageTargetCounts) {
    const current = await this.getCurrent(companyId);
    return evaluateMessageTargetAccess(
      {
        active: Boolean(current?.valid),
        groupMessaging: Boolean(current?.entitlements.groupMessaging),
        contactMessaging: Boolean(current?.entitlements.contactMessaging),
      },
      targets,
    );
  }

  async canUseContactMessaging(companyId: string) {
    return Boolean((await this.getCurrent(companyId))?.entitlements.contactMessaging);
  }

  async canUseScheduledMessages(companyId: string) {
    const current = await this.getCurrent(companyId);
    return Boolean(current?.valid && current.entitlements.scheduledMessages);
  }

  async canUseRecurringMessages(companyId: string) {
    const current = await this.getCurrent(companyId);
    return Boolean(current?.valid && current.entitlements.recurringMessages);
  }

  async canInviteUser(companyId: string) {
    const current = await this.getCurrent(companyId);
    if (!current?.valid) return { allowed: false, limit: 0 };
    const now = new Date();
    const [active, legacyInvited, pending] = await Promise.all([
      prisma.companyUser.count({ where: { companyId, status: "ACTIVE" } }),
      prisma.companyUser.count({ where: { companyId, status: "INVITED" } }),
      prisma.companyInvitation.count({ where: { companyId, status: "PENDING", reservedSeat: true, expiresAt: { gt: now } } }),
    ]);
    const used = active + legacyInvited + pending;
    return { allowed: used < current.entitlements.teamSeats, limit: current.entitlements.teamSeats, used, active, legacyInvited, pending };
  }

  async canUseAdvancedReports(companyId: string) {
    const current = await this.getCurrent(companyId);
    return Boolean(current?.valid && current.plan.advancedReportingEnabled);
  }

  async getAccountLimit(companyId: string) {
    return (await this.getCurrent(companyId))?.entitlements.whatsappConnections ?? 0;
  }

  async getTeamUserLimit(companyId: string) {
    return (await this.getCurrent(companyId))?.entitlements.teamSeats ?? 0;
  }

  async getCurrentPlan(companyId: string) {
    return (await this.getCurrent(companyId))?.plan ?? null;
  }

  async getSubscriptionStatus(companyId: string) {
    return (await this.getCurrent(companyId))?.subscription.status ?? "EXPIRED";
  }
}

export const subscriptionAccess = new SubscriptionAccessService();
