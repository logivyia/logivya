import { prisma } from "@/server/db";
import { resolveCompanyEntitlements, resolveCompanyEntitlementSummary } from "@/server/billing/company-entitlements";

export const INACTIVE_SUBSCRIPTION_MESSAGE =
  "Aboneliginiz aktif degil. Mesaj gondermek veya yeni WhatsApp hesabi baglamak icin paketinizi yenileyin.";

const ACTIVE_SUBSCRIPTION_STATUSES = ["ACTIVE", "TRIALING"] as const;
void ACTIVE_SUBSCRIPTION_STATUSES;

export class SubscriptionAccessService {
  async getCurrent(companyId: string) {
    return resolveCompanyEntitlements(companyId);
  }

  async getSummary(companyId: string) {
    return resolveCompanyEntitlementSummary(companyId);
  }

  async requireActive(companyId: string) {
    const current = await this.getCurrent(companyId);
    if (!current?.valid) throw new Error("subscription.inactive");
    return current;
  }

  async canConnectWhatsAppAccount(companyId: string) {
    const current = await this.getCurrent(companyId);
    if (!current?.valid) return { allowed: false, reason: "subscription.inactive", limit: 0 };
    return { allowed: true, reason: undefined, limit: undefined, used: 0 };
  }

  async canSendMessage(companyId: string, requestedRecipients = 0) {
    const current = await this.getCurrent(companyId);
    if (!current?.valid) return { allowed: false, reason: "subscription.inactive", limit: undefined, used: 0 };

    return { allowed: true, limit: undefined, used: requestedRecipients };
  }

  async canSendTargets(companyId: string, targets: { groupCount: number; contactCount: number }) {
    const current = await this.getCurrent(companyId);
    const used = targets.groupCount + targets.contactCount;
    if (!current?.valid) return { allowed: false, reason: "subscription.inactive", limit: undefined, used };
    if (targets.groupCount > 0 && !current.entitlements.groupMessaging) {
      return { allowed: false, reason: "entitlement.groupMessaging", limit: undefined, used };
    }
    if (targets.contactCount > 0 && !current.entitlements.contactMessaging) {
      return { allowed: false, reason: "entitlement.contactMessaging", limit: undefined, used };
    }
    return { allowed: true, reason: undefined, limit: undefined, used };
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
      prisma.companyInvitation.count({ where: { companyId, status: "PENDING", expiresAt: { gt: now } } }),
    ]);
    const used = active + legacyInvited + pending;
    return { allowed: used < current.entitlements.teamSeats, limit: current.entitlements.teamSeats, used, active, legacyInvited, pending };
  }

  async canUseAdvancedReports(companyId: string) {
    const current = await this.getCurrent(companyId);
    return Boolean(current?.valid && current.plan.advancedReportingEnabled);
  }

  async getAccountLimit(companyId: string) {
    return (await this.getCurrent(companyId))?.plan.maxWhatsappAccounts ?? 0;
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
