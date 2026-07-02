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
    const { company, user } = await requireApiSession();
    const { id } = await params;
    const account = await prisma.whatsAppAccount.findFirst({
      where: { id, companyId: company.id, userId: user.id },
      include: { _count: { select: { groups: true, contacts: true } } },
    });
    if (!account) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const qrSession = account.qrCode && account.qrExpiresAt && account.qrExpiresAt > new Date()
      ? null
      : await prisma.whatsAppSession.findUnique({ where: { accountId: account.id } });
    const sessionQrCode = qrSession?.qrCode && qrSession.expiresAt && qrSession.expiresAt > new Date() ? qrSession.qrCode : null;
    const sessionQrExpiresAt = sessionQrCode ? qrSession?.expiresAt : null;
    return NextResponse.json({
      ok: true,
      accountId: account.id,
      status: sessionQrCode ? "QR_READY" : account.status,
      qrCode: account.qrCode ?? sessionQrCode,
      qrExpiresAt: account.qrExpiresAt ?? sessionQrExpiresAt,
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
