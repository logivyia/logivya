import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { supportTicketWebVisibilityWhere } from "@/server/support";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireApiSession();
    const { id } = await params;
    const ticket = await prisma.supportTicket.findFirst({
      where: { id, ...supportTicketWebVisibilityWhere(context) },
      include: {
        company: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        messages: {
          where: { isInternal: false },
          include: { senderUser: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return ticket ? NextResponse.json({ ticket }) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
