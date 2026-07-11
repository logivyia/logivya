import { Prisma, SupportTicketStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireSupportSuperAdmin, supportTicketStatuses } from "@/server/support";

const validStatuses = new Set<SupportTicketStatus>(supportTicketStatuses);

export async function GET(request: Request) {
  try {
    await requireSupportSuperAdmin(request);
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number(params.get("page") || 1));
    const limit = Math.min(100, Math.max(10, Number(params.get("limit") || 30)));
    const status = params.get("status");
    const q = (params.get("search") || params.get("q"))?.trim();
    const category = params.get("category")?.trim();
    const companyId = params.get("companyId")?.trim();
    const userId = params.get("userId")?.trim();
    const andFilters: Prisma.SupportTicketWhereInput[] = [];
    if (userId) andFilters.push({ OR: [{ userId }, { createdById: userId }] });
    if (q) {
      andFilters.push({
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { subject: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
          { type: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { createdBy: { email: { contains: q, mode: "insensitive" } } },
          { createdBy: { name: { contains: q, mode: "insensitive" } } },
          { company: { name: { contains: q, mode: "insensitive" } } },
        ],
      });
    }
    const where: Prisma.SupportTicketWhereInput = {
      ...(status && status !== "ALL" && validStatuses.has(status as SupportTicketStatus) ? { status: status as SupportTicketStatus } : {}),
      ...(category ? { category } : {}),
      ...(companyId ? { companyId } : {}),
      ...(andFilters.length ? { AND: andFilters } : {}),
    };

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          userId: true,
          title: true,
          description: true,
          category: true,
          subject: true,
          type: true,
          source: true,
          status: true,
          priority: true,
          createdAt: true,
          updatedAt: true,
          lastMessageAt: true,
          closedAt: true,
          company: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          assignedToAdmin: { select: { id: true, name: true, email: true } },
          messages: {
            where: { isInternal: false },
            select: { id: true, senderType: true, message: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    return NextResponse.json({ tickets, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("admin.support.list_failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
}
