import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { resolveCurrentWhatsAppAccount } from "@/server/whatsapp/account-scope";
import { resolveSendableWhatsAppGroups } from "@/server/whatsapp/sendable-groups";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { resolveOwnedWhatsAppContacts } from "@/server/whatsapp/contacts";

const schema = z.object({ groupIds: z.array(z.string()).default([]), categoryIds: z.array(z.string()).default([]), contactIds: z.array(z.string()).default([]) });

export async function POST(request: Request) {
  try {
    const { company, user } = await requireApiSession();
    const body = schema.parse(await request.json());
    const account = await resolveCurrentWhatsAppAccount({ companyId: company.id, userId: user.id });
    if (!account) return NextResponse.json({ error: "WhatsApp hesabınızı bağlayın" }, { status: 409 });

    const links = body.categoryIds.length
      ? await prisma.categoryGroup.findMany({
          where: {
            categoryId: { in: body.categoryIds },
            category: { companyId: company.id, archivedAt: null },
            group: { companyId: company.id, userId: user.id, accountId: account.id, isArchived: false },
          },
          select: { groupId: true },
        })
      : [];
    const ids = [...new Set([...body.groupIds, ...links.map((item) => item.groupId)])];
    const groups = await resolveSendableWhatsAppGroups(company.id, ids, { userId: user.id, accountId: account.id });
    if (body.contactIds.length && !(await subscriptionAccess.canUseContactMessaging(company.id))) {
      return NextResponse.json({ error: "CONTACT_MESSAGING_REQUIRES_PROFESSIONAL" }, { status: 403 });
    }
    const contacts = await resolveOwnedWhatsAppContacts({ companyId: company.id, userId: user.id, accountId: account.id }, body.contactIds);
    return NextResponse.json({
      groups: groups.sort((a, b) => a.name.localeCompare(b.name, "tr")),
      contacts,
      count: groups.length + contacts.length,
      groupCount: groups.length,
      contactCount: contacts.length,
    });
  } catch (error) {
    const status = error instanceof Error && error.message === "WHATSAPP_GROUP_OWNERSHIP_MISMATCH" ? 403 : 401;
    return NextResponse.json({ error: status === 403 ? "Bu grup bu hesaba ait değil" : "UNAUTHORIZED" }, { status });
  }
}
