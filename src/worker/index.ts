import "./health";
import { Worker } from "bullmq";
import { prisma } from "@/server/db";
import { QUEUES } from "@/server/queues/contracts";
import { BaileysWhatsAppProvider } from "@/worker/baileys-provider";
import { nextRecurringRunAt, recurringJobId, type RecurringRule } from "@/server/queues/recurring";
import { campaignQueue, deadLetterQueue, messageQueue, redisConnectionOptions } from "@/server/queues/client";
import { logger } from "@/server/observability/logger";
import { cleanupStuckWhatsAppAccounts } from "@/server/whatsapp/cleanup";
import { writeWorkerHeartbeat } from "@/server/whatsapp/worker-heartbeat";
import { pairingUserMessage } from "@/server/whatsapp/pairing-errors";
import { resolveSendableWhatsAppGroups } from "@/server/whatsapp/sendable-groups";
import { createNotification, NOTIFICATION_TYPES } from "@/server/notifications/service";
/**
 * CRITICAL LOGIVYA WHATSAPP CONNECTION MODULE.
 * Do not modify without running the full WhatsApp regression test suite.
 */
import os from "node:os";
import { hasWhatsAppCredentials } from "@/lib/whatsapp/session-manager";

if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required");
const connection = redisConnectionOptions();
const provider = new BaileysWhatsAppProvider();
const workerId = process.env.WORKER_ID || `${os.hostname()}-${process.pid}`;
const workers: Worker[] = [];

function registerWorker(name: string, worker: Worker) {
  workers.push(worker);
  logger.info("worker.queue.registered", { workerId, queue: name });
  worker.on("ready", () => logger.info("worker.queue.ready", { workerId, queue: name }));
  worker.on("active", (job) => {
    logger.info("worker.job.received", { workerId, queue: name, jobId: job.id, jobName: job.name });
    if (name === QUEUES.sync) {
      const data = job.data as { action?: string; accountId?: string };
      logger.info("whatsapp.worker.job.received", { workerId, queue: name, jobId: job.id, jobName: job.name, action: data.action, accountId: data.accountId });
    }
  });
  worker.on("completed", (job) => logger.info("worker.job.completed", { workerId, queue: name, jobId: job.id, jobName: job.name }));
  worker.on("failed", (job, error) => logger.error("worker.job.failed", error, { workerId, queue: name, jobId: job?.id, jobName: job?.name }));
  worker.on("error", (error) => logger.error("worker.queue.error", error, { workerId, queue: name }));
  return worker;
}

registerWorker(QUEUES.campaign, new Worker(QUEUES.campaign,async(job)=>{
  const{templateCampaignId,companyId}=job.data as{templateCampaignId:string;companyId:string};
  const template=await prisma.messageCampaign.findFirst({where:{id:templateCampaignId,companyId,deletedAt:null,scheduleType:"RECURRING"},include:{recipients:true}});
  if(!template||["CANCELED","DELETED"].includes(template.status))return;
  const occurrence=await prisma.messageCampaign.create({data:{companyId,createdById:template.createdById,title:template.title,content:template.content,contentJson:template.contentJson??undefined,type:template.type,status:"QUEUED",scheduleType:"RECURRING",recurringRule:template.recurringRule??undefined,totalRecipients:template.recipients.length,recipients:{create:template.recipients.map(recipient=>({accountId:recipient.accountId,groupId:recipient.groupId,contactId:recipient.contactId,recipientName:recipient.recipientName,recipientExternalId:recipient.recipientExternalId}))}},include:{recipients:true}});
  const queue=messageQueue();
  try{for(const[index,recipient]of occurrence.recipients.entries())await queue.add("send-recipient",{companyId,campaignId:occurrence.id,recipientId:recipient.id},{jobId:`recipient-${recipient.id}`,delay:index*Number(process.env.WHATSAPP_MIN_DELAY_MS||3000)});}
  finally{await queue.close().catch(() => undefined);}
  const recurringQueue=campaignQueue();
  const nextRunAt = nextRecurringRunAt(template.recurringRule as RecurringRule);
  try{await recurringQueue.add("recurring-run",{companyId,templateCampaignId},{jobId:recurringJobId(templateCampaignId,nextRunAt),delay:Math.max(0,nextRunAt-Date.now())});}
  finally{await recurringQueue.close().catch(() => undefined);}
},{connection,concurrency:2}));

registerWorker(QUEUES.sync, new Worker(QUEUES.sync, async (job) => {
  const { action, accountId, phoneNumber } = job.data as { action: "connect" | "pairing" | "sync" | "disconnect" | "reconnect"; accountId: string; phoneNumber?: string };
  try{
    logger.info("whatsapp.worker.job.received", { workerId, jobId: job.id, action, accountId });
    logger.info("whatsapp.job.received", { workerId, jobId: job.id, action, accountId });
    const account=await prisma.whatsAppAccount.findUnique({where:{id:accountId},select:{status:true,archivedAt:true,updatedAt:true}});
    if(!account||account.archivedAt)return;
    if(action==="connect"&&account.updatedAt<new Date(Date.now()-10*60_000)&&["PENDING_QR","QR_READY"].includes(account.status)){
      await prisma.whatsAppAccount.update({where:{id:accountId},data:{status:"FAILED",lastError:"WHATSAPP_QR_EXPIRED",qrCode:null,qrExpiresAt:null}});
      return;
    }
    if(["connect","reconnect"].includes(action)&&account.status==="ERROR")return;
    if (action === "connect") return provider.createFreshQrSession(accountId);if(action==="pairing"){if(!phoneNumber)throw new Error("Invalid phone number.");return provider.requestPairingCode(accountId,phoneNumber)}if (action === "sync") return provider.syncGroups(accountId);if (action === "disconnect") return provider.disconnect(accountId);return provider.reconnect(accountId)}
  catch(error){const hasCredentials=await hasWhatsAppCredentials(accountId).catch(()=>false);const status=action==="pairing"||action==="connect"?"FAILED":hasCredentials?"DISCONNECTED":"RECONNECT_REQUIRED";const lastError=action==="pairing"?pairingUserMessage(error):action==="connect"?"WHATSAPP_QR_FAILED":hasCredentials?"WHATSAPP_TRANSIENT_DISCONNECT":"WHATSAPP_CREDENTIALS_MISSING";await prisma.whatsAppAccount.update({where:{id:accountId},data:{status,lastError,qrCode:null,qrExpiresAt:null}});logger.error("whatsapp.job.failed",error,{jobId:job.id,accountId,action,status,lastError});throw error}
}, { connection, concurrency: 5 }));

registerWorker(QUEUES.message, new Worker(QUEUES.message, async (job) => {
  const { recipientId } = job.data as { recipientId: string };
  logger.info("message.job.received", { workerId, jobId: job.id, recipientId });
  const recipient = await prisma.messageRecipient.findUnique({ where: { id: recipientId }, include: { campaign: true, group: true } });
  if (!recipient?.group || recipient.status === "SENT" || ["CANCELED", "CANCELING", "DELETED"].includes(recipient.campaign.status)) return;
  const claimed = await prisma.messageRecipient.updateMany({ where: { id: recipient.id, status: { in: ["PENDING", "FAILED"] } }, data: { status: "SENDING" } });
  if (!claimed.count) return;
  await prisma.messageCampaign.updateMany({ where: { id: recipient.campaignId, status: "QUEUED" }, data: { status: "SENDING" } });
  try {
    const [target] = await resolveSendableWhatsAppGroups(recipient.campaign.companyId, [recipient.group.id]);
    if (!target) throw new Error("WHATSAPP_RECONNECT_REQUIRED");
    if (target.id !== recipient.group.id || target.accountId !== recipient.accountId) {
      await prisma.messageRecipient.update({ where: { id: recipient.id }, data: { groupId: target.id, accountId: target.accountId, recipientName: target.name, recipientExternalId: target.externalGroupId } });
    }
    await provider.sendGroupMessage({ accountId: target.accountId, groupExternalId: target.externalGroupId, content: recipient.campaign.content });
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
    const nextStatus = pending ? "SENDING" : failed ? sent ? "PARTIALLY_COMPLETED" : "FAILED" : "COMPLETED";
    const updatedCampaign = await prisma.messageCampaign.update({
      where: { id: recipient.campaignId },
      data: {
        sentCount: sent,
        failedCount: failed,
        canceledCount: canceled,
        status: nextStatus,
      },
      select: { id: true, companyId: true, createdById: true, title: true, status: true, sentCount: true, failedCount: true, totalRecipients: true },
    });
    if (!pending && ["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"].includes(nextStatus) && recipient.campaign.status !== nextStatus) {
      void createCampaignFinalNotification(updatedCampaign).catch((error) => logger.error("notification.campaign_final.failed", error, { campaignId: updatedCampaign.id }));
    }
  }
}, {
  connection,
  concurrency: 1,
  limiter: { max: Number(process.env.WHATSAPP_MAX_MESSAGES_PER_MINUTE || 12), duration: 60000 },
  settings: { backoffStrategy: () => Number(process.env.WHATSAPP_MIN_DELAY_MS || 3000) + Math.floor(Math.random() * Number(process.env.WHATSAPP_MAX_DELAY_MS || 6000)) },
}));

async function recoverSessions() {
  const recoverableAccounts = await prisma.whatsAppAccount.findMany({
    where: { archivedAt: null, status: { in: ["PENDING_QR", "QR_READY", "CONNECTING", "CONNECTED", "DISCONNECTED", "RECONNECT_REQUIRED"] } },
    select: { id: true, pairingCode: true },
  });
  for (const account of recoverableAccounts) {
    if (account.pairingCode) continue;
    if (!(await hasWhatsAppCredentials(account.id))) {
      await prisma.whatsAppAccount.updateMany({
        where: { id: account.id, archivedAt: null, status: { in: ["CONNECTED", "CONNECTING", "DISCONNECTED", "RECONNECT_REQUIRED"] } },
        data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_CREDENTIALS_MISSING" },
      });
      continue;
    }
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
logger.info("worker.started", { workerId, queues: [QUEUES.campaign, QUEUES.sync, QUEUES.message] });
void writeWorkerHeartbeat(workerId).catch((error) => logger.error("worker.heartbeat.failed", error));
setInterval(() => void writeWorkerHeartbeat(workerId).catch((error) => logger.error("worker.heartbeat.failed", error)), Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS || 30_000)).unref();

console.log("Logivya WhatsApp worker is ready");

async function shutdown(signal: string) {
  logger.warn("worker.shutdown.started", { workerId, signal });
  await Promise.all(workers.map((worker) => worker.close().catch((error) => logger.error("worker.shutdown.queue_failed", error, { workerId, queue: worker.name }))));
  await prisma.$disconnect();
  logger.warn("worker.shutdown.completed", { workerId, signal });
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

async function createCampaignFinalNotification(campaign: {
  id: string;
  companyId: string;
  createdById: string;
  title: string;
  status: string;
  sentCount: number;
  failedCount: number;
  totalRecipients: number;
}) {
  const type =
    campaign.status === "COMPLETED"
      ? NOTIFICATION_TYPES.CAMPAIGN_COMPLETED
      : campaign.status === "PARTIALLY_COMPLETED"
        ? NOTIFICATION_TYPES.CAMPAIGN_PARTIAL_DELIVERY
        : NOTIFICATION_TYPES.CAMPAIGN_FAILED;
  const title =
    campaign.status === "COMPLETED"
      ? "Kampanya tamamlandı"
      : campaign.status === "PARTIALLY_COMPLETED"
        ? "Kampanya kısmen tamamlandı"
        : "Kampanya başarısız oldu";
  const message =
    campaign.status === "COMPLETED"
      ? `${campaign.title} kampanyası başarıyla tamamlandı.`
      : `${campaign.title} kampanyasında ${campaign.sentCount} başarılı, ${campaign.failedCount} başarısız teslimat var.`;
  await createNotification({
    companyId: campaign.companyId,
    userId: campaign.createdById,
    type,
    title,
    message,
    payload: {
      campaignId: campaign.id,
      status: campaign.status,
      sentCount: campaign.sentCount,
      failedCount: campaign.failedCount,
      totalRecipients: campaign.totalRecipients
    }
  });
}
