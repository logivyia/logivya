import { SupportTicketPriority, SupportTicketStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";
import { adminWritableSupportTicketStatuses, nextStatusAfterAdminReply, requireSupportSuperAdmin } from "@/server/support";

const schema = z.object({
  status: z.enum(adminWritableSupportTicketStatuses).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  message: z.string().trim().min(1).max(10000).optional(),
  internalNote: z.boolean().default(false),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSupportSuperAdmin(request);
    const { id } = await params;
    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        title: true,
        description: true,
        category: true,
        subject: true,
        type: true,
        source: true,
        status: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
        lastMessageAt: true,
        closedAt: true,
        company: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        assignedToAdmin: { select: { id: true, name: true, email: true } },
        messages: {
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
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!ticket) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ticket });
  } catch (error) {
    console.error("admin.support.detail_failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireSupportSuperAdmin(request);
    const { id } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid", details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const ticket = await prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const updated = await prisma.$transaction(async (tx) => {
      if (parsed.data.message) {
        await tx.supportTicketMessage.create({
          data: {
            ticketId: id,
            senderUserId: user.id,
            senderType: "ADMIN",
            message: parsed.data.message,
            isInternal: parsed.data.internalNote,
          },
        });
      }

      const status = parsed.data.status as SupportTicketStatus | undefined;
      const priority = parsed.data.priority as SupportTicketPriority | undefined;
      const nextStatus = status ?? (parsed.data.message ? nextStatusAfterAdminReply(ticket.status, parsed.data.internalNote) : undefined);
      const shouldClose = nextStatus === "CLOSED";
      const row = await tx.supportTicket.update({
        where: { id },
        data: {
          assignedToAdminId: user.id,
          status: nextStatus,
          priority,
          lastMessageAt: parsed.data.message && !parsed.data.internalNote ? new Date() : undefined,
          closedAt: shouldClose ? new Date() : nextStatus ? null : undefined,
        },
        select: { id: true, status: true, priority: true, lastMessageAt: true, closedAt: true },
      });

      if (parsed.data.message && !parsed.data.internalNote) {
        await tx.notification.create({
          data: {
            companyId: ticket.companyId,
            userId: ticket.createdById,
            type: "SUPPORT_REPLY",
            title: "Destek talebinize yanıt geldi",
            message: ticket.subject,
          },
        });
      }

      return row;
    });

    await writeAuditLog(request, {
      companyId: ticket.companyId,
      userId: user.id,
      action: "support.ticket.admin_updated",
      entityType: "SupportTicket",
      entityId: id,
      after: parsed.data,
    });

    return NextResponse.json({ ok: true, ticket: updated });
  } catch (error) {
    console.error("admin.support.update_failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
}
