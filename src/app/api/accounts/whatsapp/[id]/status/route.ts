import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { whatsappUserMessage } from "@/server/whatsapp/user-errors";
import { requestWhatsAppSessionRestoreIfNeeded } from "@/server/whatsapp/session-restore";
import { visiblePhonePairingCode } from "@/server/whatsapp/pairing-code-state";

function operationForAccount(status: string, phoneNumber: string | null) {
  if (["PENDING_PAIRING", "PAIRING_CODE_READY"].includes(status)) return "pairing";
  if (["PENDING_QR", "QR_READY"].includes(status)) return "qr";
  if (status === "FAILED") return phoneNumber ? "pairing" : "qr";
  return "connection";
}

function userFacingLastError(status: string, lastError: string | null) {
  if (lastError !== "WHATSAPP_CREDENTIALS_MISSING") return lastError;
  return ["CONNECTED", "CONNECTING", "DISCONNECTED", "RECONNECT_REQUIRED"].includes(status) ? "WHATSAPP_TRANSIENT_DISCONNECT" : lastError;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company, user } = await requireApiSession();
    const { id } = await params;
    let account = await prisma.whatsAppAccount.findFirst({
      where: { id, companyId: company.id, userId: user.id },
      include: { _count: { select: { groups: true, contacts: true } } },
    });
    if (!account) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (await requestWhatsAppSessionRestoreIfNeeded(account, { companyId: company.id, userId: user.id }, "web-account-status")) {
      account = await prisma.whatsAppAccount.findFirst({
        where: { id, companyId: company.id, userId: user.id },
        include: { _count: { select: { groups: true, contacts: true } } },
      });
      if (!account) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const canShowQr = ["PENDING_QR", "QR_READY"].includes(account.status);
    const qrSession = canShowQr && account.qrCode && account.qrExpiresAt && account.qrExpiresAt > new Date()
      ? null
      : canShowQr ? await prisma.whatsAppSession.findUnique({ where: { accountId: account.id } }) : null;
    const sessionQrCode = qrSession?.qrCode && qrSession.expiresAt && qrSession.expiresAt > new Date() ? qrSession.qrCode : null;
    const sessionQrExpiresAt = sessionQrCode ? qrSession?.expiresAt : null;
    const safeLastError = userFacingLastError(account.status, account.lastError);
    const safePairingCode = visiblePhonePairingCode(account);
    return NextResponse.json({
      ok: true,
      accountId: account.id,
      status: sessionQrCode ? "QR_READY" : account.status,
      qrCode: account.qrCode ?? sessionQrCode,
      qrExpiresAt: account.qrExpiresAt ?? sessionQrExpiresAt,
      pairingCode: safePairingCode.pairingCode,
      pairingCodeExpiresAt: safePairingCode.pairingCodeExpiresAt,
      phoneNumber: account.phoneNumber,
      phone: account.phoneNumber,
      displayName: account.displayName,
      connectedAt: account.lastConnectedAt,
      groupCount: account._count.groups,
      contactCount: account._count.contacts,
      lastError: safeLastError ? whatsappUserMessage(safeLastError, operationForAccount(account.status, account.phoneNumber)) : null,
      failureReasonSafe: safeLastError ? whatsappUserMessage(safeLastError, operationForAccount(account.status, account.phoneNumber)) : null,
      lastSyncedAt: account.lastSyncedAt,
      lastSyncAt: account.lastSyncedAt,
      pairingExpiresAt: safePairingCode.pairingCodeExpiresAt,
    });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
