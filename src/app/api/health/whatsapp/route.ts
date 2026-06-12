import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function GET() {
  try {
    const accounts = await prisma.whatsAppAccount.groupBy({
      by: ["status"],
      where: { archivedAt: null },
      _count: { _all: true },
    });
    return NextResponse.json({
      service: "logivya-whatsapp",
      status: "healthy",
      provider: "baileys",
      sessionStorage: process.env.WHATSAPP_SESSION_VOLUME_PERSISTENT === "true" ? "persistent-volume" : "local-filesystem",
      accounts: Object.fromEntries(accounts.map((item) => [item.status, item._count._all])),
    });
  } catch {
    return NextResponse.json({ service: "logivya-whatsapp", status: "unhealthy" }, { status: 503 });
  }
}
