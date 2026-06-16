import { z } from "zod";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { NOTIFICATION_TYPES, notifyPlatformAdmins } from "@/server/notifications/service";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({ subject: z.string().min(3).max(160), type: z.string().min(2).max(80), message: z.string().min(5).max(10000) });

export async function GET(request: Request) {
  try {
    const { company } = await requireMobileAuth(request);
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const take = Math.min(50, Math.max(10, Number(url.searchParams.get("limit") || 20)));
    const rows = await prisma.supportTicket.findMany({
      where: { companyId: company.id },
      select: { id: true, subject: true, type: true, status: true, priority: true, lastMessageAt: true, createdAt: true, messages: { select: { message: true, senderType: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { lastMessageAt: "desc" },
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
    const { company, user } = await requireMobileAuth(request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const ticket = await prisma.supportTicket.create({
      data: {
        companyId: company.id,
        createdById: user.id,
        subject: parsed.data.subject,
        type: parsed.data.type,
        priority: "MEDIUM",
        messages: { create: { senderUserId: user.id, senderType: "CUSTOMER", message: parsed.data.message } },
      },
      select: { id: true, subject: true, type: true, status: true, priority: true, createdAt: true },
    });
    await notifyPlatformAdmins({
      companyId: company.id,
      type: NOTIFICATION_TYPES.SUPPORT_TICKET_CREATED,
      title: "Yeni destek talebi",
      message: `${company.name} şirketinden yeni destek talebi oluşturuldu: ${parsed.data.subject}`,
      payload: { ticketId: ticket.id, companyId: company.id }
    });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "mobile.support.ticket.created", entityType: "SupportTicket", entityId: ticket.id });
    return mobileSuccess({ ticket }, { status: 201 });
  } catch (error) {
    return mobileSafeError(error, "Destek talebi oluşturulamadı.");
  }
}
