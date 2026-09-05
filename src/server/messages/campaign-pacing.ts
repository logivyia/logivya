import { DelayedError, type Job } from "bullmq";
import { campaignSendWaitMs } from "@/server/whatsapp/send-safety";

/** Called after ownership validation, before recipient claim / delivery intent. */
export async function deferCampaignForPacing(
  job: Pick<Job, "moveToDelayed">, accountId: string, campaignId: string, token?: string,
  reserve: typeof campaignSendWaitMs = campaignSendWaitMs,
) {
  const waitMs = await reserve(accountId, campaignId);
  if (waitMs <= 0) return;
  await job.moveToDelayed(Date.now() + waitMs, token);
  throw new DelayedError();
}
