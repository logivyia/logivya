import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/server/db";
import {
  backupWhatsAppSessionToDatabase,
  hasRestorableWhatsAppCredentials,
  restoreWhatsAppSessionFromDatabase,
  whatsappSessionDirectory,
} from "@/lib/whatsapp/session-manager";

async function cleanupSnapshotFixtures() {
  const users = await prisma.user.findMany({
    where: { username: { startsWith: "snapshot-" }, email: { endsWith: "@example.test" } },
    select: { id: true },
  });
  if (!users.length) return;

  const userIds = users.map((user) => user.id);
  const companies = await prisma.company.findMany({
    where: { name: "Snapshot Restore Test", ownerId: { in: userIds } },
    select: { id: true },
  });
  const companyIds = companies.map((company) => company.id);
  const accounts = companyIds.length
    ? await prisma.whatsAppAccount.findMany({ where: { companyId: { in: companyIds } }, select: { id: true } })
    : [];
  const accountIds = accounts.map((account) => account.id);
  await Promise.all(accountIds.map((accountId) => rm(whatsappSessionDirectory(accountId), { recursive: true, force: true })));
  if (companyIds.length) {
    await prisma.$transaction([
      prisma.whatsAppSession.deleteMany({ where: { accountId: { in: accountIds } } }),
      prisma.whatsAppAccount.deleteMany({ where: { id: { in: accountIds } } }),
      prisma.company.deleteMany({ where: { id: { in: companyIds } } }),
    ]);
  }
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  if (process.env.WHATSAPP_SNAPSHOT_INTEGRATION !== "1") throw new Error("WHATSAPP_SNAPSHOT_INTEGRATION=1 is required.");
  if (!process.env.DATABASE_URL?.includes("127.0.0.1") && !process.env.DATABASE_URL?.includes("localhost")) {
    throw new Error("WhatsApp snapshot integration test requires a localhost PostgreSQL database.");
  }
  await cleanupSnapshotFixtures();
  const suffix = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      name: "Snapshot Restore Test",
      username: `snapshot-${suffix}`,
      email: `snapshot-${suffix}@example.test`,
      passwordHash: "not-a-real-password-hash",
    },
  });
  const company = await prisma.company.create({ data: { name: "Snapshot Restore Test", ownerId: user.id } });
  const account = await prisma.whatsAppAccount.create({
    data: { companyId: company.id, userId: user.id, provider: "BAILEYS", status: "CONNECTED" },
  });
  const directory = whatsappSessionDirectory(account.id);
  const creds = JSON.stringify({ registered: true, marker: `snapshot-${suffix}` });
  const appState = JSON.stringify({ key: `app-state-${suffix}` });

  try {
    await mkdir(path.join(directory, "keys"), { recursive: true });
    await writeFile(path.join(directory, "creds.json"), creds);
    await writeFile(path.join(directory, "keys", "app-state.json"), appState);

    assert.equal(await backupWhatsAppSessionToDatabase(account.id, "integration-test"), true);
    const stored = await prisma.whatsAppSession.findUniqueOrThrow({ where: { accountId: account.id } });
    assert(stored.sessionDataEncrypted);
    assert(!stored.sessionDataEncrypted.includes(`snapshot-${suffix}`), "Encrypted snapshot leaked plaintext marker.");

    await rm(directory, { recursive: true, force: true });
    assert.equal(await hasRestorableWhatsAppCredentials(account.id), true);
    assert.equal(await restoreWhatsAppSessionFromDatabase(account.id), true);
    assert.equal(await readFile(path.join(directory, "creds.json"), "utf8"), creds);
    assert.equal(await readFile(path.join(directory, "keys", "app-state.json"), "utf8"), appState);

    const restored = await prisma.whatsAppSession.findUniqueOrThrow({ where: { accountId: account.id } });
    assert.equal(restored.restoreCount, 1);
    console.log(JSON.stringify({
      verified: true,
      accountId: account.id,
      encrypted: true,
      plaintextPersistedInDatabase: false,
      restoredFiles: 2,
      restoreCount: restored.restoreCount,
    }, null, 2));
  } finally {
    await rm(directory, { recursive: true, force: true });
    await cleanupSnapshotFixtures().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
