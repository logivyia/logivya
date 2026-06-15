import { z } from "zod";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({ message: z.string().min(1).max(10000), attachmentUrl: z.string().url().optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company, user } = await requireMobileAuth(request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const { id } = await params;
    const ticket = await prisma.supportTicket.findFirst({ where: { id, companyId: company.id } });
    if (!ticket) return mobileError("NOT_FOUND", "Destek talebi bulunamadı.", { status: 404 });
    const message = await prisma.supportTicketMessage.create({
      data: { ticketId: id, senderUserId: user.id, senderType: "CUSTOMER", message: parsed.data.message, attachmentUrl: parsed.data.attachmentUrl },
      select: { id: true, senderType: true, message: true, attachmentUrl: true, createdAt: true },
    });
    await prisma.supportTicket.update({ where: { id }, data: { lastMessageAt: new Date(), status: ticket.status === "CLOSED" ? "OPEN" : ticket.status } });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "mobile.support.message.created", entityType: "SupportTicket", entityId: id });
    return mobileSuccess({ message }, { status: 201 });
  } catch (error) {
    return mobileSafeError(error, "Destek mesajı gönderilemedi.");
  }
}
