import "./health";
import { Worker } from "bullmq";
import { prisma } from "@/server/db";
import { QUEUES } from "@/server/queues/contracts";
import { BaileysWhatsAppProvider } from "@/worker/baileys-provider";
import { recurringDelay, type RecurringRule } from "@/server/queues/recurring";
import { campaignQueue, deadLetterQueue, messageQueue } from "@/server/queues/client";
import { logger } from "@/server/observability/logger";
import { cleanupStuckWhatsAppAccounts } from "@/server/whatsapp/cleanup";

if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required");
const redisUrl = new URL(process.env.REDIS_URL);
const connection = { host: redisUrl.hostname, port: Number(redisUrl.port || 6379), username: redisUrl.username || undefined, password: redisUrl.password || undefined, tls: redisUrl.protocol === "rediss:" ? { servername: redisUrl.hostname } : undefined, maxRetriesPerRequest: null };
const provider = new BaileysWhatsAppProvider();

new Worker(QUEUES.campaign,async(job)=>{
  const{templateCampaignId,companyId}=job.data as{templateCampaignId:string;companyId:string};
  const template=await prisma.messageCampaign.findFirst({where:{id:templateCampaignId,companyId,deletedAt:null,scheduleType:"RECURRING"},include:{recipients:true}});
  if(!template||["CANCELED","DELETED"].includes(template.status))return;
  const occurrence=await prisma.messageCampaign.create({data:{companyId,createdById:template.createdById,title:template.title,content:template.content,contentJson:template.contentJson??undefined,type:template.type,status:"QUEUED",scheduleType:"RECURRING",recurringRule:template.recurringRule??undefined,totalRecipients:template.recipients.length,recipients:{create:template.recipients.map(recipient=>({accountId:recipient.accountId,groupId:recipient.groupId,contactId:recipient.contactId,recipientName:recipient.recipientName,recipientExternalId:recipient.recipientExternalId}))}},include:{recipients:true}});
  const queue=messageQueue();for(const[index,recipient]of occurrence.recipients.entries())await queue.add("send-recipient",{companyId,campaignId:occurrence.id,recipientId:recipient.id},{jobId:`recipient-${recipient.id}`,delay:index*Number(process.env.WHATSAPP_MIN_DELAY_MS||3000)});
  await campaignQueue().add("recurring-run",{companyId,templateCampaignId},{jobId:`recurring-${templateCampaignId}-${Date.now()}`,delay:recurringDelay(template.recurringRule as RecurringRule)});
},{connection,concurrency:2});

new Worker(QUEUES.sync, async (job) => {
  const { action, accountId } = job.data as { action: "connect" | "sync" | "disconnect" | "reconnect"; accountId: string };
  try{
    const account=await prisma.whatsAppAccount.findUnique({where:{id:accountId},select:{status:true,archivedAt:true,updatedAt:true}});
    if(!account||account.archivedAt)return;
    if(["connect","reconnect"].includes(action)&&account.updatedAt<new Date(Date.now()-10*60_000)&&["PENDING_QR","QR_READY","CONNECTING"].includes(account.status)){
      await prisma.whatsAppAccount.update({where:{id:accountId},data:{status:"ERROR",lastError:"QR generation expired. Please generate a new QR code.",qrCode:null,qrExpiresAt:null}});
      return;
    }
    if(["connect","reconnect"].includes(action)&&account.status==="ERROR")return;
    if (action === "connect") return provider.createSession(accountId);if (action === "sync") return provider.syncGroups(accountId);if (action === "disconnect") return provider.disconnect(accountId);return provider.reconnect(accountId)}
  catch(error){await prisma.whatsAppAccount.update({where:{id:accountId},data:{status:"ERROR",lastError:error instanceof Error?error.message:"WhatsApp operation failed"}});logger.error("whatsapp.job.failed",error,{jobId:job.id,accountId,action});throw error}
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
    await prisma.messageRecipient.update({ where: { id: recipient.id }, data: { status: "SENT", sentAt: new Date(), failedAt: null, errorMessage: null } });
  } catch (error) {
    const attempts = Number(job.opts.attempts ?? 1);
    const finalAttempt = job.attemptsMade + 1 >= attempts;
    const errorMessage = error instanceof Error ? error.message : "Send failed";
    await prisma.messageRecipient.update({
      where: { id: recipient.id },
      data: { status: finalAttempt ? "FAILED" : "PENDING", failedAt: finalAttempt ? new Date() : null, errorMessage },
    });
    if (finalAttempt) {
      const queue = deadLetterQueue();
      try {
        await queue.add("message-send-failed", { ...job.data, errorMessage }, { jobId: `dead-letter-${recipient.id}` });
      } finally {
        await queue.close();
      }
    }
    logger.error("message.send.failed",error,{jobId:job.id,companyId:recipient.campaign.companyId,accountId:recipient.accountId,campaignId:recipient.campaignId,recipientId:recipient.id,finalAttempt});throw error;
  } finally {
    const counts = await prisma.messageRecipient.groupBy({ by: ["status"], where: { campaignId: recipient.campaignId }, _count: { _all: true } });
    const count = (status: string) => counts.find((item) => item.status === status)?._count._all ?? 0;
    const pending = count("PENDING") + count("SENDING");
    const sent = count("SENT"), failed = count("FAILED"), canceled = count("CANCELED");
    await prisma.messageCampaign.update({
      where: { id: recipient.campaignId },
      data: {
        sentCount: sent,
        failedCount: failed,
        canceledCount: canceled,
        status: pending ? "SENDING" : failed ? sent ? "PARTIALLY_COMPLETED" : "FAILED" : "COMPLETED",
      },
    });
  }
}, {
  connection,
  concurrency: 1,
  limiter: { max: Number(process.env.WHATSAPP_MAX_MESSAGES_PER_MINUTE || 12), duration: 60000 },
  settings: { backoffStrategy: () => Number(process.env.WHATSAPP_MIN_DELAY_MS || 3000) + Math.floor(Math.random() * Number(process.env.WHATSAPP_MAX_DELAY_MS || 6000)) },
});

async function recoverSessions() {
  const recoverableAccounts = await prisma.whatsAppAccount.findMany({
    where: { archivedAt: null, status: { in: ["PENDING_QR", "QR_READY", "CONNECTING", "CONNECTED", "DISCONNECTED"] } },
    select: { id: true },
  });
  for (const account of recoverableAccounts) {
    void provider.createSession(account.id).catch((error) => console.error("WhatsApp session recovery failed", account.id, error));
  }
}
void recoverSessions().catch((error) => console.error("WhatsApp session recovery bootstrap failed", error));

async function cleanupStuckSessions() {
  const result = await cleanupStuckWhatsAppAccounts();
  if (result.count) logger.warn("whatsapp.stuck_sessions.cleaned", { count: result.count });
}
void cleanupStuckSessions().catch((error) => logger.error("whatsapp.stuck_sessions.cleanup_failed", error));
setInterval(() => void cleanupStuckSessions().catch((error) => logger.error("whatsapp.stuck_sessions.cleanup_failed", error)), 60_000).unref();

console.log("Logivya WhatsApp worker is ready");
