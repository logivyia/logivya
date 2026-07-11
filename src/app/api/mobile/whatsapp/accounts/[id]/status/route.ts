import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { serializeMobileAccount } from "@/server/mobile/whatsapp";
import { requestWhatsAppSessionRestoreIfNeeded } from "@/server/whatsapp/session-restore";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company, user } = await requireMobileAuth(request);
    const { id } = await params;
    let account = await prisma.whatsAppAccount.findFirst({
      where: { id, companyId: company.id, userId: user.id },
      include: { _count: { select: { groups: true, contacts: true } } },
    });
    if (!account) return mobileError("NOT_FOUND", "WhatsApp hesabı bulunamadı.", { status: 404 });
    if (await requestWhatsAppSessionRestoreIfNeeded(account, { companyId: company.id, userId: user.id }, "mobile-whatsapp-account-status")) {
      account = await prisma.whatsAppAccount.findFirst({
        where: { id, companyId: company.id, userId: user.id },
        include: { _count: { select: { groups: true, contacts: true } } },
      });
      if (!account) return mobileError("NOT_FOUND", "WhatsApp hesabi bulunamadi.", { status: 404 });
    }
    return mobileSuccess({ account: serializeMobileAccount(account) });
  } catch (error) {
    return mobileSafeError(error);
  }
}
