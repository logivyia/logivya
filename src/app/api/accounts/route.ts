import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { whatsappQueue } from "@/server/queues/client";

const schema = z.object({ label: z.string().min(2).max(80) });
export async function POST(request: Request) {
  try {
    const { company } = await requireApiSession();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    const account = await prisma.whatsAppAccount.create({ data: { companyId: company.id, label: parsed.data.label, provider: "baileys", status: "PENDING_QR" } });
    try {
      await whatsappQueue().add("connect", { action: "connect", accountId: account.id }, { jobId: `connect-${account.id}` });
    } catch (error) {
      await prisma.whatsAppAccount.delete({ where: { id: account.id } });
      throw error;
    }
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 503 }); }
}
