import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({
  subject: z.string().min(3).max(160),
  type: z.string().min(2).max(80),
  message: z.string().min(5).max(10000),
});

export async function GET(request: Request) {
  try {
    const { company } = await requireApiSession();
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number(params.get("page") || 1));
    const status = params.get("status");
    const where = { companyId: company.id, ...(status ? { status: status as never } : {}) };

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          createdBy: { select: { name: true, email: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { lastMessageAt: "desc" },
        skip: (page - 1) * 20,
        take: 20,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    return NextResponse.json({ tickets, pagination: { page, total, pages: Math.ceil(total / 20) } });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { company, user } = await requireApiSession();
    const parsed = schema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        companyId: company.id,
        createdById: user.id,
        subject: parsed.data.subject,
        type: parsed.data.type,
        priority: "MEDIUM",
        messages: {
          create: {
            senderUserId: user.id,
            senderType: "CUSTOMER",
            message: parsed.data.message,
          },
        },
      },
    });

    const admins = await prisma.platformAdmin.findMany({
      where: { role: "SUPER_ADMIN", isActive: true },
      select: { userId: true },
    });

    if (admins.length) {
      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          companyId: company.id,
          userId: admin.userId,
          type: "SUPPORT_TICKET_CREATED",
          title: "Yeni destek talebi",
          message: `${company.name} şirketinden yeni destek talebi oluşturuldu: ${parsed.data.subject}`,
        })),
      });
    }

    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "support.ticket.created",
      entityType: "SupportTicket",
      entityId: ticket.id,
      after: { type: parsed.data.type, priority: "MEDIUM", adminNotifications: admins.length },
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
