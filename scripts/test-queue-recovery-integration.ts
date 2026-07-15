import assert from "node:assert/strict";
import { Queue } from "bullmq";
import { prisma } from "@/server/db";
import { campaignQueue, messageQueue } from "@/server/queues/client";
import { reconcileDurableMessageQueues } from "@/server/queues/recovery";

if (process.env.QUEUE_RECOVERY_INTEGRATION !== "1") {
  throw new Error("QUEUE_RECOVERY_INTEGRATION=1 is required for this destructive isolated-environment test.");
}
if (!process.env.DATABASE_URL?.includes("127.0.0.1") && !process.env.DATABASE_URL?.includes("localhost")) {
  throw new Error("Queue recovery integration test requires a localhost PostgreSQL database.");
}
if (!process.env.REDIS_URL?.includes("127.0.0.1") && !process.env.REDIS_URL?.includes("localhost")) {
  throw new Error("Queue recovery integration test requires a localhost Redis instance.");
}

async function clearQueue(queue: Queue) {
  await queue.obliterate({ force: true });
}

async function cleanupQueueRecoveryFixtures() {
  const users = await prisma.user.findMany({
    where: { username: { startsWith: "queue-" }, email: { endsWith: "@example.test" } },
    select: { id: true },
  });
  if (!users.length) return;

  const userIds = users.map((user) => user.id);
  const companies = await prisma.company.findMany({
    where: { name: "Queue Recovery Test", ownerId: { in: userIds } },
    select: { id: true },
  });
  const companyIds = companies.map((company) => company.id);
  if (companyIds.length) {
    const campaigns = await prisma.messageCampaign.findMany({
      where: { companyId: { in: companyIds } },
      select: { id: true },
    });
    const campaignIds = campaigns.map((campaign) => campaign.id);
    await prisma.$transaction([
      prisma.messageRecipient.deleteMany({ where: { campaignId: { in: campaignIds } } }),
      prisma.messageCampaign.deleteMany({ where: { id: { in: campaignIds } } }),
      prisma.whatsAppGroup.deleteMany({ where: { companyId: { in: companyIds } } }),
      prisma.whatsAppAccount.deleteMany({ where: { companyId: { in: companyIds } } }),
      prisma.company.deleteMany({ where: { id: { in: companyIds } } }),
    ]);
  }
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
const now = new Date();
const scheduledAt = new Date(now.getTime() + 30 * 60_000);
const recurringAt = new Date(now.getTime() + 45 * 60_000);
const suffix = Date.now().toString(36);

const sendQueue = messageQueue();
const recurringQueue = campaignQueue();

try {
  await clearQueue(sendQueue);
  await clearQueue(recurringQueue);
  await cleanupQueueRecoveryFixtures();

  const user = await prisma.user.create({
    data: {
      name: "Queue Recovery Test",
      username: `queue-${suffix}`,
      email: `queue-${suffix}@example.test`,
      passwordHash: "not-a-real-password-hash",
    },
  });
  const company = await prisma.company.create({ data: { name: "Queue Recovery Test", ownerId: user.id } });
  const account = await prisma.whatsAppAccount.create({
    data: { companyId: company.id, userId: user.id, provider: "BAILEYS", status: "CONNECTED" },
  });
  const group = await prisma.whatsAppGroup.create({
    data: {
      companyId: company.id,
      userId: user.id,
      accountId: account.id,
      externalGroupId: `${suffix}@g.us`,
      name: "Queue Recovery Group",
      lastSyncedAt: now,
    },
  });

  const scheduled = await prisma.messageCampaign.create({
    data: {
      companyId: company.id,
      createdById: user.id,
      title: "Scheduled recovery",
      content: "scheduled",
      type: "WHATSAPP_GROUP",
      status: "QUEUED",
      scheduleType: "SCHEDULED",
      scheduledAt,
      totalRecipients: 1,
      recipients: { create: { accountId: account.id, groupId: group.id, recipientName: group.name, recipientExternalId: group.externalGroupId } },
    },
    include: { recipients: true },
  });

  const interrupted = await prisma.messageCampaign.create({
    data: {
      companyId: company.id,
      createdById: user.id,
      title: "Interrupted recovery",
      content: "interrupted",
      type: "WHATSAPP_GROUP",
      status: "SENDING",
      scheduleType: "SEND_NOW",
      totalRecipients: 1,
      recipients: { create: { accountId: account.id, groupId: group.id, recipientName: group.name, recipientExternalId: group.externalGroupId, status: "SENDING" } },
    },
    include: { recipients: true },
  });
  await prisma.messageRecipient.update({
    where: { id: interrupted.recipients[0].id },
    data: { updatedAt: new Date(now.getTime() - 20 * 60_000) },
  });

  const sent = await prisma.messageCampaign.create({
    data: {
      companyId: company.id,
      createdById: user.id,
      title: "Delete recovery",
      content: "delete",
      type: "WHATSAPP_GROUP",
      status: "COMPLETED",
      scheduleType: "SEND_NOW",
      totalRecipients: 1,
      sentCount: 1,
      deleteForEveryoneStatus: "DELETE_PENDING",
      recipients: {
        create: {
          accountId: account.id,
          groupId: group.id,
          recipientName: group.name,
          recipientExternalId: group.externalGroupId,
          status: "SENT",
          sentAt: now,
          messageKeyJson: { id: `message-${suffix}`, remoteJid: group.externalGroupId, fromMe: true },
          deleteForEveryoneStatus: "PENDING",
        },
      },
    },
    include: { recipients: true },
  });

  const staleDelete = await prisma.messageCampaign.create({
    data: {
      companyId: company.id,
      createdById: user.id,
      title: "Interrupted delete recovery",
      content: "delete stale",
      type: "WHATSAPP_GROUP",
      status: "COMPLETED",
      scheduleType: "SEND_NOW",
      totalRecipients: 1,
      sentCount: 1,
      deleteForEveryoneStatus: "DELETE_PENDING",
      recipients: {
        create: {
          accountId: account.id,
          groupId: group.id,
          recipientName: group.name,
          recipientExternalId: group.externalGroupId,
          status: "SENT",
          sentAt: new Date(now.getTime() - 60_000),
          messageKeyJson: { id: `stale-message-${suffix}`, remoteJid: group.externalGroupId, fromMe: true },
          deleteForEveryoneStatus: "PROCESSING",
          deleteForEveryoneAttemptedAt: new Date(now.getTime() - 20 * 60_000),
        },
      },
    },
    include: { recipients: true },
  });

  const recurring = await prisma.messageCampaign.create({
    data: {
      companyId: company.id,
      createdById: user.id,
      title: "Recurring recovery",
      content: "recurring",
      type: "WHATSAPP_GROUP",
      status: "QUEUED",
      scheduleType: "RECURRING",
      recurringRule: { frequency: "DAILY", interval: 1 },
      nextRunAt: recurringAt,
      totalRecipients: 1,
      recipients: { create: { accountId: account.id, groupId: group.id, recipientName: group.name, recipientExternalId: group.externalGroupId } },
    },
    include: { recipients: true },
  });

  const first = await reconcileDurableMessageQueues();
  assert.equal(first.resetStaleRecipients, 1);
  assert.equal(first.resetStaleDeletes, 1);
  assert.equal(first.recipientJobs, 2);
  assert.equal(first.deleteJobs, 2);
  assert.equal(first.recurringJobs, 1);

  assert(await sendQueue.getJob(`recovery-recipient-${scheduled.recipients[0].id}`));
  assert(await sendQueue.getJob(`recovery-recipient-${interrupted.recipients[0].id}`));
  assert(await sendQueue.getJob(`recovery-delete-${sent.recipients[0].id}`));
  assert(await sendQueue.getJob(`recovery-delete-${staleDelete.recipients[0].id}`));
  const recurringJobs = await recurringQueue.getJobs(["delayed", "waiting"]);
  assert(recurringJobs.some((job) => job.data.templateCampaignId === recurring.id));

  const resetRecipient = await prisma.messageRecipient.findUniqueOrThrow({ where: { id: interrupted.recipients[0].id } });
  assert.equal(resetRecipient.status, "RETRYING");

  const second = await reconcileDurableMessageQueues();
  assert.equal(second.resetStaleRecipients, 0);
  assert.equal(second.resetStaleDeletes, 0);
  assert.equal(second.recipientJobs, 0);
  assert.equal(second.deleteJobs, 0);
  assert.equal(second.recurringJobs, 0);

  console.log(JSON.stringify({ first, second, verified: true }, null, 2));
} finally {
  await clearQueue(sendQueue).catch(() => undefined);
  await clearQueue(recurringQueue).catch(() => undefined);
  await cleanupQueueRecoveryFixtures().catch(() => undefined);
  await sendQueue.close().catch(() => undefined);
  await recurringQueue.close().catch(() => undefined);
  await prisma.$disconnect();
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
