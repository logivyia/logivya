import { NextResponse } from "next/server";
import { adminAuditPrivacyWhere } from "@/server/admin/message-privacy";
import { hasAdminPermission } from "@/server/auth/admin-permissions";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { requestId, safeAdminError } from "@/server/security/admin-request";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requirePlatformAdmin("admin.companies.read", request);
    const can = (permission: string) =>
      hasAdminPermission(
        admin.platformAdmin.role,
        admin.platformAdmin.permissions,
        permission,
      );
    const canReadUsers = can("admin.users.read");
    const canReadBilling = can("admin.billing.read");
    const canReadWhatsApp = can("admin.whatsapp.read");
    const canReadSupport = can("admin.support.read");
    const canReadAudit = can("admin.audit.read");
    const { id } = await params;
    const company = await prisma.company.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        securityStatus: true,
        createdAt: true,
        updatedAt: true,
        owner: canReadUsers
          ? {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                status: true,
              },
            }
          : false,
        members: canReadUsers
          ? {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                role: true,
                status: true,
                lifecycleState: true,
                createdAt: true,
                user: {
                  select: { id: true, name: true, email: true, status: true },
                },
              },
            }
          : false,
        billingProfile: canReadBilling
          ? {
              select: {
                billingType: true,
                companyName: true,
                legalName: true,
                tradeName: true,
                fullName: true,
                taxOffice: true,
                taxNumber: true,
                nationalIdNumber: true,
                country: true,
                city: true,
                district: true,
                addressLine1: true,
                addressLine2: true,
                postalCode: true,
                billingEmail: true,
                billingPhone: true,
                invoiceType: true,
                eInvoiceEligible: true,
                eArchiveEligible: true,
                updatedAt: true,
              },
            }
          : false,
        subscriptions: canReadBilling
          ? {
              orderBy: { createdAt: "desc" },
              take: 20,
              select: {
                id: true,
                status: true,
                billingPeriod: true,
                startsAt: true,
                endsAt: true,
                trialStartsAt: true,
                trialEndsAt: true,
                currentPeriodStartsAt: true,
                currentPeriodEndsAt: true,
                cancelAtPeriodEnd: true,
                source: true,
                provider: true,
                createdAt: true,
                updatedAt: true,
                plan: { select: { id: true, name: true, slug: true } },
                events: {
                  orderBy: { createdAt: "desc" },
                  take: 20,
                  select: {
                    id: true,
                    type: true,
                    message: true,
                    createdAt: true,
                  },
                },
              },
            }
          : false,
        payments: canReadBilling
          ? {
              orderBy: { createdAt: "desc" },
              take: 20,
              select: {
                id: true,
                status: true,
                provider: true,
                paymentMethod: true,
                amount: true,
                currency: true,
                paidAt: true,
                failedAt: true,
                createdAt: true,
              },
            }
          : false,
        invoices: canReadBilling
          ? {
              orderBy: { createdAt: "desc" },
              take: 20,
              select: {
                id: true,
                invoiceNumber: true,
                invoiceType: true,
                status: true,
                currency: true,
                subtotalAmount: true,
                taxAmount: true,
                totalAmount: true,
                issuedAt: true,
                dueAt: true,
                paidAt: true,
                createdAt: true,
              },
            }
          : false,
        accounts: canReadWhatsApp
          ? {
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
            }
          : false,
        supportTickets: canReadSupport
          ? {
              orderBy: { lastMessageAt: "desc" },
              take: 20,
              select: {
                id: true,
                publicId: true,
                title: true,
                category: true,
                status: true,
                priority: true,
                lastMessageAt: true,
                createdAt: true,
              },
            }
          : false,
        internalNotes: canReadSupport
          ? {
              orderBy: { createdAt: "desc" },
              take: 20,
              select: {
                id: true,
                adminUserId: true,
                note: true,
                createdAt: true,
              },
            }
          : false,
        auditLogs: canReadAudit
          ? {
              where: adminAuditPrivacyWhere(),
              orderBy: { createdAt: "desc" },
              take: 30,
              select: {
                id: true,
                userId: true,
                action: true,
                entityType: true,
                entityId: true,
                createdAt: true,
              },
            }
          : false,
      },
    });
    return company
      ? NextResponse.json({ company })
      : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  } catch (error) {
    const safe = safeAdminError(error, requestId(request));
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
