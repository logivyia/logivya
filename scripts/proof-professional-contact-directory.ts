import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (key && !process.env[key]) process.env[key] = parts.join("=").replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const [{ prisma }, { subscriptionAccess }, { listOwnedWhatsAppContacts }] = await Promise.all([
    import("../src/server/db"),
    import("../src/server/billing/subscription-access"),
    import("../src/server/whatsapp/contacts"),
  ]);

  const accounts = await prisma.whatsAppAccount.findMany({
    where: { status: "CONNECTED", archivedAt: null, userId: { not: null } },
    select: { id: true, companyId: true, userId: true },
    orderBy: { createdAt: "asc" },
  });
  const proofRows: Array<Record<string, unknown>> = [];
  const professionalAccounts: typeof accounts = [];

  for (const account of accounts) {
    assert(account.userId, "Connected account must have an owner.");
    const current = await subscriptionAccess.getCurrent(account.companyId);
    if (!current?.valid || current.plan.slug !== "professional") continue;
    professionalAccounts.push(account);

    const listed = [];
    let page = 1;
    let expectedTotal = 0;
    while (true) {
      const result = await listOwnedWhatsAppContacts({
        companyId: account.companyId,
        userId: account.userId,
        accountId: account.id,
        page,
        limit: 100,
      });
      expectedTotal = result.pageInfo.total;
      listed.push(...result.contacts);
      if (!result.pageInfo.hasMore) break;
      page += 1;
    }

    assert(listed.length === expectedTotal, `Account ${account.id.slice(0, 8)} was truncated across pages.`);
    assert(new Set(listed.map((contact) => contact.id)).size === listed.length, `Account ${account.id.slice(0, 8)} returned duplicate contacts.`);
    assert(listed.every((contact) => contact.accountId === account.id), `Account ${account.id.slice(0, 8)} leaked a foreign contact.`);
    assert(listed.every((contact) => Boolean(contact.displayName?.trim())), `Account ${account.id.slice(0, 8)} returned an empty display name.`);

    const membership = await prisma.companyUser.findFirst({
      where: { companyId: account.companyId, userId: account.userId, status: "ACTIVE" },
      select: { role: true },
    });
    proofRows.push({
      account: account.id.slice(0, 8),
      membershipRole: membership?.role ?? "MISSING",
      pages: page,
      expectedTotal,
      listedTotal: listed.length,
      named: listed.filter((contact) => contact.displayNameSource !== "PHONE_FALLBACK").length,
      phoneFallback: listed.filter((contact) => contact.displayNameSource === "PHONE_FALLBACK").length,
    });
  }

  let crossAccountDenied = true;
  const first = professionalAccounts[0];
  const foreign = professionalAccounts.find((account) => account.userId !== first?.userId);
  if (first?.userId && foreign) {
    crossAccountDenied = false;
    try {
      await listOwnedWhatsAppContacts({
        companyId: first.companyId,
        userId: first.userId,
        accountId: foreign.id,
        page: 1,
        limit: 10,
      });
    } catch (error) {
      crossAccountDenied = error instanceof Error && error.message === "WHATSAPP_ACCOUNT_REQUIRED";
    }
  }
  assert(crossAccountDenied, "A user was able to list another user's WhatsApp account contacts.");

  const activeMemberships = await prisma.companyUser.findMany({
    where: { status: "ACTIVE" },
    select: { companyId: true, userId: true, role: true },
  });
  const professionalMemberships: typeof activeMemberships = [];
  for (const membership of activeMemberships) {
    const current = await subscriptionAccess.getCurrent(membership.companyId);
    if (!current?.valid || current.plan.slug !== "professional") continue;
    assert(await subscriptionAccess.canUseContactMessaging(membership.companyId), "An active Professional seat lost contact messaging entitlement.");
    professionalMemberships.push(membership);
  }

  const invitedProfessionalSeats = professionalMemberships.filter((membership) => membership.role !== "OWNER");
  const invitedSeatsWithOwnAccount = await prisma.whatsAppAccount.count({
    where: {
      archivedAt: null,
      OR: invitedProfessionalSeats.map((membership) => ({ companyId: membership.companyId, userId: membership.userId })),
    },
  });

  console.log(JSON.stringify({
    professionalAccounts: proofRows,
    crossAccountDenied,
    activeProfessionalSeats: professionalMemberships.length,
    invitedProfessionalSeats: invitedProfessionalSeats.length,
    invitedSeatsWithOwnAccount,
    ownershipModel: "USER_OWNED_WHATSAPP_ACCOUNT",
  }, null, 2));

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
