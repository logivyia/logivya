import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { whatsappUserMessage } from "@/server/whatsapp/user-errors";

function operationForAccount(status: string, phoneNumber: string | null) {
  if (["PENDING_PAIRING", "PAIRING_CODE_READY"].includes(status)) return "pairing";
  if (["PENDING_QR", "QR_READY"].includes(status)) return "qr";
  if (status === "FAILED") return phoneNumber ? "pairing" : "qr";
  return "connection";
}

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
      ok: true,
      accountId: account.id,
      status: account.status,
      qrCode: account.qrCode,
      qrExpiresAt: account.qrExpiresAt,
      pairingCode: account.pairingCode,
      pairingCodeExpiresAt: account.pairingCodeExpiresAt,
      phoneNumber: account.phoneNumber,
      phone: account.phoneNumber,
      displayName: account.displayName,
      connectedAt: account.lastConnectedAt,
      groupCount: account._count.groups,
      contactCount: account._count.contacts,
      lastError: account.lastError ? whatsappUserMessage(account.lastError, operationForAccount(account.status, account.phoneNumber)) : null,
      failureReasonSafe: account.lastError ? whatsappUserMessage(account.lastError, operationForAccount(account.status, account.phoneNumber)) : null,
      lastSyncedAt: account.lastSyncedAt,
      lastSyncAt: account.lastSyncedAt,
      pairingExpiresAt: account.pairingCodeExpiresAt,
    });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
