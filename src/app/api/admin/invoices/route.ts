import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("admin.billing.read", request);
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number(params.get("page") || 1));
    const query = params.get("q")?.trim() || "";
    const status = params.get("status")?.trim().toUpperCase();
    const where: Prisma.InvoiceWhereInput = {
      ...(status && ["DRAFT", "ISSUED", "PAID", "CANCELED", "FAILED"].includes(status) ? { status: status as never } : {}),
      ...(query ? {
        OR: [
          { invoiceNumber: { contains: query, mode: "insensitive" } },
          { billingName: { contains: query, mode: "insensitive" } },
          { billingEmail: { contains: query, mode: "insensitive" } },
          { company: { name: { contains: query, mode: "insensitive" } } },
        ],
      } : {}),
    };
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: { company: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 30,
        take: 30,
      }),
      prisma.invoice.count({ where }),
    ]);
    return NextResponse.json({ invoices, pagination: { page, total, pages: Math.max(1, Math.ceil(total / 30)) } });
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
}
