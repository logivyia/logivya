import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { supportTicketOwnerWhere } from "@/server/support";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireMobileAuth(request);
    const { id } = await params;
    const where: Prisma.SupportTicketWhereInput = {
      id,
      ...supportTicketOwnerWhere(context),
    };
    const ticket = await prisma.supportTicket.findFirst({
      where,
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
        company: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        messages: {
          where: { isInternal: false },
          select: { id: true, senderType: true, message: true, attachmentUrl: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!ticket) return mobileError("NOT_FOUND", "Destek talebi bulunamadı.", { status: 404 });
    return mobileSuccess({ ticket });
  } catch (error) {
    return mobileSafeError(error);
  }
}
