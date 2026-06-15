import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { serializeMobileAccount } from "@/server/mobile/whatsapp";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company } = await requireMobileAuth(request);
    const { id } = await params;
    const account = await prisma.whatsAppAccount.findFirst({
      where: { id, companyId: company.id },
      include: { _count: { select: { groups: true, contacts: true } } },
    });
    if (!account) return mobileError("NOT_FOUND", "WhatsApp hesabı bulunamadı.", { status: 404 });
    return mobileSuccess({ account: serializeMobileAccount(account) });
  } catch (error) {
    return mobileSafeError(error);
  }
}
