import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { supportTicketOwnerWhere } from "@/server/support";

const schema = z.object({ message: z.string().trim().min(1).max(10000), attachmentUrl: z.string().url().optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireApiSession();
    const { user } = context;
    const { id } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });

    const ticket = await prisma.supportTicket.findFirst({ where: { id, ...supportTicketOwnerWhere(context) } });
    if (!ticket) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    await prisma.$transaction([
      prisma.supportTicketMessage.create({
        data: { ticketId: id, senderUserId: user.id, senderType: "CUSTOMER", ...parsed.data },
      }),
      prisma.supportTicket.update({
        where: { id },
        data: { status: "PENDING", lastMessageAt: new Date() },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
