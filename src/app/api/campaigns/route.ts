import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { campaignQueue, messageQueue } from "@/server/queues/client";
import { requirePermission } from "@/server/auth/permissions";
import { writeAuditLog } from "@/server/security/audit";
import { recurringDelay, type RecurringRule } from "@/server/queues/recurring";
import { subscriptionAccess } from "@/server/billing/subscription-access";

const schema = z.object({
  title: z.string().min(1).max(120),
  content: z.string().min(1).max(4096),
  groupIds: z.array(z.string()).default([]),
  categoryIds: z.array(z.string()).default([]),
  scheduleType: z.enum(["SEND_NOW", "SCHEDULED", "RECURRING"]).default("SEND_NOW"),
  scheduledAt: z.coerce.date().optional(),
  recurringRule: z.object({frequency:z.enum(["DAILY","WEEKLY","MONTHLY"]),interval:z.number().int().min(1).max(365).default(1)}).optional(),
}).superRefine((value,ctx)=>{if(!value.groupIds.length&&!value.categoryIds.length)ctx.addIssue({code:"custom",message:"validation.required",path:["groupIds"]});if(value.scheduleType==="SCHEDULED"&&!value.scheduledAt)ctx.addIssue({code:"custom",message:"validation.required",path:["scheduledAt"]});if(value.scheduleType==="RECURRING"&&!value.recurringRule)ctx.addIssue({code:"custom",message:"validation.required",path:["recurringRule"]})});
export async function POST(request: Request) {
  try {
    const { company, user, membership } = await requireApiSession();
    requirePermission(membership.role, "send_messages");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    if (parsed.data.scheduleType!=="SEND_NOW") requirePermission(membership.role,"schedule_messages");
    const access=await subscriptionAccess.canSendMessage(company.id);
    if(!access.allowed){await writeAuditLog(request,{companyId:company.id,userId:user.id,action:"subscription.access_blocked",entityType:"MessageCampaign",after:{reason:access.reason}});return NextResponse.json({error:access.reason},{status:403})}
    if(parsed.data.scheduleType==="SCHEDULED"&&!await subscriptionAccess.canUseScheduledMessages(company.id))return NextResponse.json({error:"subscription.featureUnavailable"},{status:403});
    if(parsed.data.scheduleType==="RECURRING"&&!await subscriptionAccess.canUseRecurringMessages(company.id))return NextResponse.json({error:"subscription.featureUnavailable"},{status:403});
    const categoryGroups=parsed.data.categoryIds.length?await prisma.categoryGroup.findMany({where:{categoryId:{in:parsed.data.categoryIds},category:{companyId:company.id,archivedAt:null}},select:{groupId:true}}):[];
    const requestedIds=[...new Set([...parsed.data.groupIds,...categoryGroups.map(item=>item.groupId)])];
    const groups = await prisma.whatsAppGroup.findMany({
      where: { id: { in: requestedIds }, companyId: company.id, isArchived: false, canSend: true, account: { status: "CONNECTED" } },
    });
    if (!groups.length) return NextResponse.json({ error: "campaign.noConnectedRecipients" }, { status: 400 });
    const campaign = await prisma.messageCampaign.create({
      data: {
        companyId: company.id, createdById: user.id, title: parsed.data.title, content: parsed.data.content, type: "WHATSAPP_GROUP", status: "QUEUED", scheduleType: parsed.data.scheduleType, scheduledAt: parsed.data.scheduledAt, recurringRule: parsed.data.recurringRule as Prisma.InputJsonValue | undefined, totalRecipients: groups.length,
        recipients: { create: groups.map((group) => ({ accountId: group.accountId, groupId: group.id, recipientName: group.name, recipientExternalId: group.externalGroupId })) },
      },
      include: { recipients: true },
    });
    if(parsed.data.scheduleType==="RECURRING"){
      await campaignQueue().add("recurring-run",{companyId:company.id,templateCampaignId:campaign.id},{jobId:`recurring-${campaign.id}-${Date.now()}`,delay:recurringDelay(parsed.data.recurringRule as RecurringRule)});
    }else{
      const queue = messageQueue();
      const baseDelay=parsed.data.scheduleType==="SCHEDULED"&&parsed.data.scheduledAt?Math.max(0,parsed.data.scheduledAt.getTime()-Date.now()):0;
      for (const [index, recipient] of campaign.recipients.entries()) {
        await queue.add("send-recipient", { companyId: company.id, campaignId: campaign.id, recipientId: recipient.id }, { jobId:`recipient-${recipient.id}`, delay:baseDelay+index * Number(process.env.WHATSAPP_MIN_DELAY_MS || 3000) });
      }
    }
    await writeAuditLog(request,{companyId:company.id,userId:user.id,action:"campaign.created",entityType:"MessageCampaign",entityId:campaign.id,after:{scheduleType:campaign.scheduleType,totalRecipients:campaign.totalRecipients}});
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 503 }); }
}
