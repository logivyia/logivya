import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company, user } = await requireApiSession();
    const { id } = await params;
    const account = await prisma.whatsAppAccount.findFirst({ where: { id, companyId: company.id, userId: user.id }, include: { sessions: { orderBy: { updatedAt: "desc" }, take: 1 } } });
    if (!account) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const session = account.sessions[0];
    return NextResponse.json({ status: account.status, qrCode: account.qrCode||session?.qrCode, expiresAt: account.qrExpiresAt||session?.expiresAt, phoneNumber: account.phoneNumber, displayName: account.displayName,lastError:account.lastError });
  } catch { return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }); }
}
