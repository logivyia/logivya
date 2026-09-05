import { prisma } from "../../src/server/db";

async function main() {
  const accountId = process.argv[2]?.trim();
  if (!accountId) throw new Error("ACCOUNT_ID_REQUIRED");
  const account = await prisma.whatsAppAccount.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      status: true,
      phoneNumber: true,
      displayName: true,
      company: { select: { name: true } },
      user: { select: { email: true } },
      lastConnectedAt: true,
      lastHeartbeatAt: true,
      lastSyncedAt: true,
      lastGroupSyncAt: true,
      lastContactSyncAt: true,
      lastMessageAt: true,
      sessionSnapshotAt: true,
      healthScore: true,
      reconnectRetryCount: true,
      lastError: true,
      pairingCodeExpiresAt: true,
      _count: { select: { groups: true, contacts: true, sessions: true } },
    },
  });
  console.log(JSON.stringify({
    ok: Boolean(account),
    account: account ? {
      ...account,
      phoneNumber: account.phoneNumber
        ? `${account.phoneNumber.slice(0, 4)}****${account.phoneNumber.slice(-2)}`
        : null,
      user: account.user?.email
        ? { email: account.user.email.replace(/^(.{2}).*(@.*)$/, "$1***$2") }
        : null,
      groupCount: account._count.groups,
      contactCount: account._count.contacts,
      sessionCount: account._count.sessions,
      _count: undefined,
    } : null,
  }));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "UNKNOWN_ERROR" }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
