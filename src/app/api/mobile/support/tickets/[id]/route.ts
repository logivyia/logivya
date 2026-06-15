import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company } = await requireMobileAuth(request);
    const { id } = await params;
    const ticket = await prisma.supportTicket.findFirst({
      where: { id, companyId: company.id },
      select: {
        id: true, subject: true, type: true, status: true, priority: true, createdAt: true, lastMessageAt: true,
        messages: { select: { id: true, senderType: true, message: true, attachmentUrl: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!ticket) return mobileError("NOT_FOUND", "Destek talebi bulunamadı.", { status: 404 });
    return mobileSuccess({ ticket });
  } catch (error) {
    return mobileSafeError(error);
  }
}
