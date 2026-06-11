import "./health";
import { Worker } from "bullmq";
import { prisma } from "@/server/db";
import { QUEUES } from "@/server/queues/contracts";
import { BaileysWhatsAppProvider } from "@/worker/baileys-provider";

if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required");
const redisUrl = new URL(process.env.REDIS_URL);
const connection = { host: redisUrl.hostname, port: Number(redisUrl.port || 6379), username: redisUrl.username || undefined, password: redisUrl.password || undefined, tls: redisUrl.protocol === "rediss:" ? { servername: redisUrl.hostname } : undefined, maxRetriesPerRequest: null };
const provider = new BaileysWhatsAppProvider();

new Worker(QUEUES.sync, async (job) => {
  const { action, accountId } = job.data as { action: "connect" | "sync" | "disconnect" | "reconnect"; accountId: string };
  if (action === "connect") return provider.createSession(accountId);
  if (action === "sync") return provider.syncGroups(accountId);
  if (action === "disconnect") return provider.disconnect(accountId);
  return provider.reconnect(accountId);
}, { connection, concurrency: 5 });

new Worker(QUEUES.message, async (job) => {
  const { recipientId } = job.data as { recipientId: string };
  const recipient = await prisma.messageRecipient.findUnique({ where: { id: recipientId }, include: { campaign: true, group: true } });
  if (!recipient?.group || recipient.status === "SENT" || ["CANCELED", "CANCELING", "DELETED"].includes(recipient.campaign.status)) return;
  const claimed = await prisma.messageRecipient.updateMany({ where: { id: recipient.id, status: { in: ["PENDING", "FAILED"] } }, data: { status: "SENDING" } });
  if (!claimed.count) return;
  await prisma.messageCampaign.updateMany({ where: { id: recipient.campaignId, status: "QUEUED" }, data: { status: "SENDING" } });
  try {
    await provider.sendGroupMessage({ accountId: recipient.accountId, groupExternalId: recipient.group.externalGroupId, content: recipient.campaign.content });
    await prisma.messageRecipient.update({ where: { id: recipient.id }, data: { status: "SENT", sentAt: new Date() } });
    await prisma.messageCampaign.update({ where: { id: recipient.campaignId }, data: { sentCount: { increment: 1 } } });
  } catch (error) {
    await prisma.messageRecipient.update({ where: { id: recipient.id }, data: { status: "FAILED", failedAt: new Date(), errorMessage: error instanceof Error ? error.message : "Send failed" } });
    await prisma.messageCampaign.update({ where: { id: recipient.campaignId }, data: { failedCount: { increment: 1 } } });
    throw error;
  } finally {
    const counts = await prisma.messageRecipient.groupBy({ by: ["status"], where: { campaignId: recipient.campaignId }, _count: { _all: true } });
    const count = (status: string) => counts.find((item) => item.status === status)?._count._all ?? 0;
    const pending = count("PENDING") + count("SENDING");
    if (!pending) {
      const sent = count("SENT"), failed = count("FAILED");
      await prisma.messageCampaign.update({ where: { id: recipient.campaignId }, data: { status: failed ? sent ? "PARTIALLY_COMPLETED" : "FAILED" : "COMPLETED" } });
    }
  }
}, {
  connection,
  concurrency: 1,
  limiter: { max: Number(process.env.WHATSAPP_MAX_MESSAGES_PER_MINUTE || 12), duration: 60000 },
  settings: { backoffStrategy: () => Number(process.env.WHATSAPP_MIN_DELAY_MS || 3000) + Math.floor(Math.random() * Number(process.env.WHATSAPP_MAX_DELAY_MS || 6000)) },
});

async function recoverSessions() {
  const recoverableAccounts = await prisma.whatsAppAccount.findMany({
    where: { archivedAt: null, status: { in: ["PENDING_QR", "CONNECTING", "CONNECTED", "DISCONNECTED"] } },
    select: { id: true },
  });
  for (const account of recoverableAccounts) {
    void provider.createSession(account.id).catch((error) => console.error("WhatsApp session recovery failed", account.id, error));
  }
}
void recoverSessions().catch((error) => console.error("WhatsApp session recovery bootstrap failed", error));

console.log("Logivya WhatsApp worker is ready");
