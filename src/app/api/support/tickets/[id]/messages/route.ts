import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { canReplyToSupportTicket, nextStatusAfterUserReply, supportTicketOwnerWhere } from "@/server/support";

const schema = z.object({ message: z.string().trim().min(1).max(10000), attachmentUrl: z.string().url().optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireApiSession();
    const { user } = context;
    const { id } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });

    const ticket = await prisma.supportTicket.findFirst({ where: { id, ...supportTicketOwnerWhere(context) } });
    if (!ticket) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (!canReplyToSupportTicket(ticket)) {
      return NextResponse.json({ error: "TICKET_CLOSED", message: "Talep kapalı olduğu için yanıt yazılamaz." }, { status: 409 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const message = await tx.supportTicketMessage.create({
        data: { ticketId: id, senderUserId: user.id, senderType: "USER", ...parsed.data },
        select: {
          id: true,
          senderType: true,
          message: true,
          attachmentUrl: true,
          isInternal: true,
          createdAt: true,
          updatedAt: true,
          senderUser: { select: { name: true, email: true } },
        },
      });
      const updated = await tx.supportTicket.update({
        where: { id },
        data: { status: nextStatusAfterUserReply(ticket.status), lastMessageAt: new Date(), closedAt: null },
        select: { id: true, status: true, lastMessageAt: true, closedAt: true },
      });
      return { message, ticket: updated };
    });

    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
