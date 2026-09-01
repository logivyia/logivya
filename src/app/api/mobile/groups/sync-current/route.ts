import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import {
  mobileError,
  mobileSafeError,
  mobileSuccess,
} from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";
import {
  listRecoverableWhatsAppAccounts,
  requestCurrentAccountGroupSync,
} from "@/server/whatsapp/account-scope";

const GROUP_SYNC_WAIT_MS = 6_000;
const GROUP_SYNC_POLL_MS = 500;

type SyncBaseline = {
  id: string;
  lastGroupSyncAt: Date | null;
  lastSyncedAt: Date | null;
};

function syncTimestamp(account: {
  lastGroupSyncAt: Date | null;
  lastSyncedAt: Date | null;
}) {
  return account.lastGroupSyncAt ?? account.lastSyncedAt;
}

async function waitForGroupSync(
  scope: { companyId: string; userId: string },
  baselines: SyncBaseline[],
) {
  const pending = new Map(
    baselines.map((account) => [
      account.id,
      syncTimestamp(account)?.getTime() ?? 0,
    ]),
  );
  const completed = new Set<string>();
  const deadline = Date.now() + GROUP_SYNC_WAIT_MS;

  while (pending.size > 0 && Date.now() < deadline) {
    const accounts = await prisma.whatsAppAccount.findMany({
      where: {
        companyId: scope.companyId,
        userId: scope.userId,
        id: { in: [...pending.keys()] },
        archivedAt: null,
      },
      select: {
        id: true,
        lastGroupSyncAt: true,
        lastSyncedAt: true,
      },
    });

    for (const account of accounts) {
      const previous = pending.get(account.id);
      const current = syncTimestamp(account)?.getTime() ?? 0;
      if (previous !== undefined && current > previous) {
        pending.delete(account.id);
        completed.add(account.id);
      }
    }

    if (pending.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, GROUP_SYNC_POLL_MS));
    }
  }

  return [...completed];
}

export async function POST(request: Request) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "manage_groups");

    const body = await request.json().catch(() => ({}));
    const accountId =
      typeof body.accountId === "string" ? body.accountId : undefined;
    const scope = { companyId: company.id, userId: user.id };
    const accounts = await listRecoverableWhatsAppAccounts(scope, {
      accountId,
      requireConnected: true,
    });

    if (accounts.length === 0) {
      return mobileError(
        "WHATSAPP_ACCOUNT_REQUIRED",
        "WhatsApp hesabınızı bağlayın",
        { status: 409 },
      );
    }

    const jobs = await Promise.all(
      accounts.map((account) =>
        requestCurrentAccountGroupSync(
          scope,
          account,
          "mobile-manual-refresh",
        ),
      ),
    );
    const completedAccountIds = await waitForGroupSync(scope, accounts);
    const accountIds = accounts.map((account) => account.id);
    const primaryAccountId = accounts[0]!.id;
    const groupCount = await prisma.whatsAppGroup.count({
      where: {
        companyId: company.id,
        userId: user.id,
        accountId: { in: accountIds },
        isArchived: false,
      },
    });

    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "mobile.whatsapp.groups.sync_current.requested",
      entityType: "WhatsAppAccount",
      entityId: primaryAccountId,
      after: {
        accountIds,
        jobIds: jobs.map((job) => job.id),
        completedAccountIds,
        groupCount,
      },
    }).catch(() => undefined);

    return mobileSuccess({
      message:
        completedAccountIds.length > 0
          ? "WhatsApp grupları yenilendi"
          : "WhatsApp grupları yenileniyor",
      accountId: primaryAccountId,
      jobId: jobs[0]?.id ?? null,
      accountIds,
      jobIds: jobs.map((job) => job.id),
      completedAccountIds,
      groupCount,
    });
  } catch (error) {
    return mobileSafeError(error, "Gruplar yenilenemedi.");
  }
}
