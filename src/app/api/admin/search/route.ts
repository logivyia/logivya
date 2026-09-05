import { NextResponse } from "next/server";

import { hasAdminPermission } from "@/server/auth/admin-permissions";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { requestId, safeAdminError } from "@/server/security/admin-request";

export async function GET(request: Request) {
  try {
    const admin = await requirePlatformAdmin("admin.dashboard.read", request);
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (query.length < 2)
      return NextResponse.json({ companies: [], users: [], tickets: [] });

    const canReadCompanies = hasAdminPermission(
      admin.platformAdmin.role,
      admin.platformAdmin.permissions,
      "admin.companies.read",
    );
    const canReadBilling = hasAdminPermission(
      admin.platformAdmin.role,
      admin.platformAdmin.permissions,
      "admin.billing.read",
    );
    const [companies, users, tickets] = await Promise.all([
      canReadCompanies
        ? prisma.company.findMany({
            where: {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                ...(canReadBilling
                  ? [
                      {
                        email: {
                          contains: query,
                          mode: "insensitive" as const,
                        },
                      },
                      {
                        phone: {
                          contains: query,
                          mode: "insensitive" as const,
                        },
                      },
                    ]
                  : []),
              ],
            },
            select: { id: true, name: true, email: canReadBilling },
            take: 6,
          })
        : Promise.resolve([]),
      hasAdminPermission(
        admin.platformAdmin.role,
        admin.platformAdmin.permissions,
        "admin.users.read",
      )
        ? prisma.user.findMany({
            where: {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { email: { contains: query, mode: "insensitive" } },
                { phone: { contains: query, mode: "insensitive" } },
              ],
            },
            select: { id: true, name: true, email: true },
            take: 6,
          })
        : Promise.resolve([]),
      hasAdminPermission(
        admin.platformAdmin.role,
        admin.platformAdmin.permissions,
        "admin.support.read",
      )
        ? prisma.supportTicket.findMany({
            where: { subject: { contains: query, mode: "insensitive" } },
            select: {
              id: true,
              publicId: true,
              subject: true,
              company: { select: { name: true } },
            },
            take: 6,
          })
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      companies: companies.map((company) => ({
        id: company.id,
        label: company.name,
        detail: "email" in company ? company.email : undefined,
        href: `/admin/companies/${company.id}`,
      })),
      users: users.map((user) => ({
        id: user.id,
        label: user.name,
        detail: user.email,
        href: `/admin/users?search=${encodeURIComponent(user.email)}`,
      })),
      tickets: tickets.map((ticket) => ({
        id: ticket.id,
        label: ticket.subject,
        detail: ticket.company.name,
        href: `/admin/support/${ticket.publicId}`,
      })),
    });
  } catch (error) {
    const safe = safeAdminError(error, requestId(request));
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
