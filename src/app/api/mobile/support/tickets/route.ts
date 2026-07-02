import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { NOTIFICATION_TYPES, notifyPlatformAdmins } from "@/server/notifications/service";
import { writeAuditLog } from "@/server/security/audit";
import { supportTicketIdentityData, supportTicketOwnerWhere } from "@/server/support";

const schema = z.object({
  subject: z.string().trim().min(3).max(160),
  type: z.string().trim().min(2).max(80),
  message: z.string().trim().min(5).max(10000),
});

const ticketSelect = {
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
  lastMessageAt: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  messages: {
    select: { message: true, senderType: true, createdAt: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
} satisfies Prisma.SupportTicketSelect;

export async function GET(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const take = Math.min(50, Math.max(10, Number(url.searchParams.get("limit") || 20)));
    const status = url.searchParams.get("status");
    const where: Prisma.SupportTicketWhereInput = {
      ...supportTicketOwnerWhere(context),
      ...(status && status !== "ALL" ? { status: status as never } : {}),
    };

    const rows = await prisma.supportTicket.findMany({
      where,
      select: ticketSelect,
      orderBy: { createdAt: "desc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: take + 1,
    });
    const hasMore = rows.length > take;
    const tickets = rows.slice(0, take);
    return mobileSuccess({ tickets, pageInfo: { nextCursor: hasMore ? tickets.at(-1)?.id : null, hasMore } });
  } catch (error) {
    return mobileSafeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const { company, user } = context;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);

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
        source: "MOBILE",
        priority: "MEDIUM",
        messages: {
          create: {
            senderUserId: user.id,
            senderType: "CUSTOMER",
            message: parsed.data.message,
          },
        },
      },
      select: ticketSelect,
    });

    await notifyPlatformAdmins({
      companyId: company.id,
      type: NOTIFICATION_TYPES.SUPPORT_TICKET_CREATED,
      title: "Yeni destek talebi",
      message: `${company.name} şirketinden yeni destek talebi oluşturuldu: ${parsed.data.subject}`,
      payload: { ticketId: ticket.id, companyId: company.id },
    }).catch((notificationError) =>
      console.error("mobile.support.notification_failed", {
        error: notificationError instanceof Error ? notificationError.message : String(notificationError),
        ticketId: ticket.id,
      }),
    );

    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "mobile.support.ticket.created",
      entityType: "SupportTicket",
      entityId: ticket.id,
      after: { type: parsed.data.type, source: "MOBILE", priority: "MEDIUM" },
    }).catch((auditError) =>
      console.error("mobile.support.audit_failed", {
        error: auditError instanceof Error ? auditError.message : String(auditError),
        ticketId: ticket.id,
      }),
    );

    return mobileSuccess({ ticket }, { status: 201 });
  } catch (error) {
    console.error("mobile.support.ticket_create_failed", { error: error instanceof Error ? error.message : String(error) });
    return mobileSafeError(error, "Destek talebi oluşturulamadı.");
  }
}
