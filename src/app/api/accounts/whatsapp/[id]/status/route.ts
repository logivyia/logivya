import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { whatsappUserMessage } from "@/server/whatsapp/user-errors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company } = await requireApiSession();
    const { id } = await params;
    const account = await prisma.whatsAppAccount.findFirst({
      where: { id, companyId: company.id },
      include: { _count: { select: { groups: true, contacts: true } } },
    });
    if (!account) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({
      accountId: account.id,
      status: account.status,
      qrCode: account.qrCode,
      qrExpiresAt: account.qrExpiresAt,
      pairingCode: account.pairingCode,
      pairingCodeExpiresAt: account.pairingCodeExpiresAt,
      phoneNumber: account.phoneNumber,
      displayName: account.displayName,
      groupCount: account._count.groups,
      contactCount: account._count.contacts,
      lastError: account.lastError ? whatsappUserMessage(account.lastError, account.pairingCode ? "pairing" : "connection") : null,
      lastSyncedAt: account.lastSyncedAt,
    });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
