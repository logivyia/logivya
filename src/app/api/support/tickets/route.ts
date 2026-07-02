import { Prisma, SupportTicketStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { NOTIFICATION_TYPES, notifyPlatformAdmins } from "@/server/notifications/service";
import { writeAuditLog } from "@/server/security/audit";
import { supportTicketIdentityData, supportTicketWebVisibilityWhere } from "@/server/support";

const schema = z.object({
  subject: z.string().trim().min(3).max(160),
  type: z.string().trim().min(2).max(80),
  message: z.string().trim().min(5).max(10000),
});

const validStatuses = new Set<SupportTicketStatus>(["OPEN", "PENDING", "IN_PROGRESS", "RESOLVED", "CLOSED"]);

export async function GET(request: Request) {
  try {
    const context = await requireApiSession();
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number(params.get("page") || 1));
    const status = params.get("status");
    const where: Prisma.SupportTicketWhereInput = {
      ...supportTicketWebVisibilityWhere(context),
      ...(status && validStatuses.has(status as SupportTicketStatus) ? { status: status as SupportTicketStatus } : {}),
    };

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          company: { select: { id: true, name: true } },
          createdBy: { select: { name: true, email: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { lastMessageAt: "desc" },
        skip: (page - 1) * 20,
        take: 20,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    return NextResponse.json({ tickets, pagination: { page, total, pages: Math.ceil(total / 20) } });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireApiSession();
    const { company, user } = context;
    const parsed = schema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        companyId: company.id,
        createdById: user.id,
        ...supportTicketIdentityData(context, {
          title: parsed.data.subject,
          category: parsed.data.type,
          description: parsed.data.message,
        }),
        subject: parsed.data.subject,
        type: parsed.data.type,
        source: "WEB",
        priority: "MEDIUM",
        messages: {
          create: {
            senderUserId: user.id,
            senderType: "CUSTOMER",
            message: parsed.data.message,
          },
        },
      },
      include: {
        company: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    let adminNotificationCount = 0;
    try {
      const notifications = await notifyPlatformAdmins({
        companyId: company.id,
        type: NOTIFICATION_TYPES.SUPPORT_TICKET_CREATED,
        title: "Yeni destek talebi",
        message: `${company.name} sirketinden yeni destek talebi olusturuldu: ${parsed.data.subject}`,
        payload: { ticketId: ticket.id, companyId: company.id },
      });
      adminNotificationCount = notifications.length;
    } catch (notificationError) {
      console.error("support.notification_failed", {
        error: notificationError instanceof Error ? notificationError.message : String(notificationError),
        ticketId: ticket.id,
      });
    }

    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "support.ticket.created",
      entityType: "SupportTicket",
      entityId: ticket.id,
      after: { type: parsed.data.type, priority: "MEDIUM", adminNotifications: adminNotificationCount },
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
