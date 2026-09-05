import type { PrismaClient } from "@prisma/client";

type PolicyRepository = Pick<PrismaClient, "whatsAppAccount" | "whatsAppGroup" | "whatsAppIngestionControl">;
type ReceptionReason = "unregistered" | "paused" | "missing_owner" | "no_approved_source" | "approved_source" | "policy_unavailable";

export type PendingReceptionPolicy = { enabled: boolean; reason: ReceptionReason };

/** Pending protocol delivery is not full chat history or permission to persist chats.
 * Capture still checks current source approval/ownership separately on every event.
 */
export async function resolveApprovedPendingReception(
  repository: PolicyRepository,
  accountId: string,
  registered: boolean,
): Promise<PendingReceptionPolicy> {
  if (!registered) return { enabled: false, reason: "unregistered" };
  try {
    const control = await repository.whatsAppIngestionControl.findUnique({
      where: { id: "global" }, select: { globallyPaused: true, emergencyKillSwitch: true },
    });
    if (!control || control.globallyPaused || control.emergencyKillSwitch) {
      return { enabled: false, reason: "paused" };
    }
    const account = await repository.whatsAppAccount.findUnique({
      where: { id: accountId }, select: { id: true, userId: true, companyId: true, archivedAt: true },
    });
    if (!account || account.id !== accountId || !account.userId || !account.companyId || account.archivedAt) {
      return { enabled: false, reason: "missing_owner" };
    }
    const source = await repository.whatsAppGroup.findFirst({
      where: {
        accountId, userId: account.userId, companyId: account.companyId,
        isArchived: false, ingestionEnabled: true,
        ingestionApprovedAt: { not: null }, ingestionPausedAt: null,
        account: { archivedAt: null, userId: account.userId, companyId: account.companyId },
      },
      select: { id: true },
    });
    return source
      ? { enabled: true, reason: "approved_source" }
      : { enabled: false, reason: "no_approved_source" };
  } catch {
    // Never enable reception on a failed ownership/approval lookup.
    return { enabled: false, reason: "policy_unavailable" };
  }
}
