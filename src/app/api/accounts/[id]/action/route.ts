import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { whatsappQueue } from "@/server/queues/client";

const schema = z.object({ action: z.enum(["sync", "disconnect", "reconnect", "archive"]) });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company } = await requireApiSession();
    const { id } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    const account = await prisma.whatsAppAccount.findFirst({ where: { id, companyId: company.id } });
    if (!account) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (parsed.data.action === "archive") {
      await prisma.whatsAppAccount.update({ where: { id }, data: { archivedAt: new Date(), status: "ARCHIVED" } });
    } else {
      await whatsappQueue().add(parsed.data.action, { action: parsed.data.action, accountId: id });
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 503 }); }
}
