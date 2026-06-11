import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { messageQueue } from "@/server/queues/client";

const schema = z.object({ title: z.string().min(2).max(120), content: z.string().min(1).max(4096), categoryIds: z.array(z.string()).min(1) });
export async function POST(request: Request) {
  try {
    const { company, user } = await requireApiSession();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    const categoryGroups = await prisma.categoryGroup.findMany({
      where: { categoryId: { in: parsed.data.categoryIds }, category: { companyId: company.id }, group: { isArchived: false, canSend: true, account: { status: "CONNECTED" } } },
      include: { group: true },
      distinct: ["groupId"],
    });
    if (!categoryGroups.length) return NextResponse.json({ error: "campaign.noConnectedRecipients" }, { status: 400 });
    const campaign = await prisma.messageCampaign.create({
      data: {
        companyId: company.id, createdById: user.id, title: parsed.data.title, content: parsed.data.content, type: "WHATSAPP_GROUP", status: "QUEUED", scheduleType: "SEND_NOW", totalRecipients: categoryGroups.length,
        recipients: { create: categoryGroups.map(({ group }) => ({ accountId: group.accountId, groupId: group.id, recipientName: group.name, recipientExternalId: group.externalGroupId })) },
      },
      include: { recipients: true },
    });
    const queue = messageQueue();
    for (const [index, recipient] of campaign.recipients.entries()) {
      await queue.add("send-recipient", { companyId: company.id, campaignId: campaign.id, recipientId: recipient.id }, { delay: index * Number(process.env.WHATSAPP_MIN_DELAY_MS || 3000) });
    }
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 503 }); }
}
