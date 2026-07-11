import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";
import { nextStatusAfterAdminReply, requireSupportSuperAdmin } from "@/server/support";

const schema = z.object({
  message: z.string().trim().min(1).max(10000).optional(),
  body: z.string().trim().min(1).max(10000).optional(),
  attachmentUrl: z.string().url().optional(),
  internalNote: z.boolean().default(false),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireSupportSuperAdmin(request);
    const { id } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "validation.invalid", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const body = parsed.data.message || parsed.data.body;
    if (!body) return NextResponse.json({ error: "validation.invalid", message: "Yanıt yazın." }, { status: 400 });

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, companyId: true, createdById: true, subject: true, status: true },
    });
    if (!ticket) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const message = await tx.supportTicketMessage.create({
        data: {
          ticketId: id,
          senderUserId: user.id,
          senderType: "ADMIN",
          message: body,
          attachmentUrl: parsed.data.attachmentUrl,
          isInternal: parsed.data.internalNote,
        },
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

      const nextStatus = nextStatusAfterAdminReply(ticket.status, parsed.data.internalNote);
      const updated = await tx.supportTicket.update({
        where: { id },
        data: {
          assignedToAdminId: user.id,
          status: nextStatus,
          lastMessageAt: parsed.data.internalNote ? undefined : now,
          closedAt: nextStatus ? null : undefined,
        },
        select: { id: true, status: true, lastMessageAt: true, closedAt: true },
      });

      if (!parsed.data.internalNote) {
        await tx.notification.create({
          data: {
            companyId: ticket.companyId,
            userId: ticket.createdById,
            type: "SUPPORT_REPLY",
            title: "Yönetici yanıtı",
            message: ticket.subject,
          },
        });
      }

      return { message, ticket: updated };
    });

    await writeAuditLog(request, {
      companyId: ticket.companyId,
      userId: user.id,
      action: "support.ticket.admin_replied",
      entityType: "SupportTicket",
      entityId: id,
      after: { internalNote: parsed.data.internalNote, hasAttachment: Boolean(parsed.data.attachmentUrl) },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("admin.support.message_create_failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
}
