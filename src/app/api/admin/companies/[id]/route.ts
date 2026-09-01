import { NextResponse } from "next/server";
import { adminAuditPrivacyWhere } from "@/server/admin/message-privacy";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin("admin.companies.read", request);
    const { id } = await params;
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        owner: { select: { name: true, email: true, phone: true } },
        billingProfile: true,
        members: { include: { user: { select: { name: true, email: true, status: true } } } },
        subscriptions: { include: { plan: true, events: { orderBy: { createdAt: "desc" }, take: 20 } }, orderBy: { createdAt: "desc" }, take: 3 },
        accounts: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            label: true,
            phoneNumber: true,
            displayName: true,
            provider: true,
            status: true,
            lastConnectedAt: true,
            lastDisconnectedAt: true,
            lastSyncedAt: true,
            archivedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        payments: { orderBy: { createdAt: "desc" }, take: 20 },
        invoices: { orderBy: { createdAt: "desc" }, take: 20 },
        supportTickets: { orderBy: { lastMessageAt: "desc" }, take: 20 },
        internalNotes: { orderBy: { createdAt: "desc" }, take: 20 },
        auditLogs: {
          where: adminAuditPrivacyWhere(),
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { id: true, userId: true, action: true, entityType: true, entityId: true, createdAt: true },
        },
      },
    });
    return company ? NextResponse.json({ company }) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
}
