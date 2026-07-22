import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, user } = await requireApiSession();
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const campaign = await prisma.messageCampaign.findFirst({
      where: { id, companyId: company.id, createdById: user.id },
      select: { id: true },
    });
    if (!campaign) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const recipients = await prisma.messageRecipient.findMany({
      where: { campaignId: id },
      select: {
        id: true,
        accountId: true,
        groupId: true,
        contactId: true,
        targetType: true,
        recipientName: true,
        recipientExternalId: true,
        status: true,
        attemptCount: true,
        externalMessageId: true,
        deleteForEveryoneStatus: true,
        deletedForMeAt: true,
        errorMessage: true,
        sentAt: true,
        failedAt: true,
        renderedContent: true,
        attributionApplied: true,
        attributionLocale: true,
        renderedAt: true,
        createdAt: true,
        updatedAt: true,
        account: { select: { phoneNumber: true, label: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 101,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return NextResponse.json({ recipients: recipients.slice(0, 100), nextCursor: recipients.length > 100 ? recipients[99]?.id : null });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
