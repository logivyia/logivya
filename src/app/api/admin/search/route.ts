import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("platform:read", request);
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (query.length < 2) return NextResponse.json({ companies: [], users: [], tickets: [] });

    const [companies, users, tickets] = await Promise.all([
      prisma.company.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { phone: { contains: query, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, email: true },
        take: 6,
      }),
      prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { phone: { contains: query, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, email: true },
        take: 6,
      }),
      prisma.supportTicket.findMany({
        where: { subject: { contains: query, mode: "insensitive" } },
        select: { id: true, subject: true, company: { select: { name: true } } },
        take: 6,
      }),
    ]);

    return NextResponse.json({
      companies: companies.map((company) => ({ id: company.id, label: company.name, detail: company.email })),
      users: users.map((user) => ({ id: user.id, label: user.name, detail: user.email })),
      tickets: tickets.map((ticket) => ({ id: ticket.id, label: ticket.subject, detail: ticket.company.name })),
    });
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
}
