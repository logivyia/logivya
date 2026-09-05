import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/server/auth/session";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { resolveCategoryContactsForSend } from "@/server/categories/category-targets";
import { prisma } from "@/server/db";
import { resolveCurrentWhatsAppAccount } from "@/server/whatsapp/account-scope";
import { resolveOwnedWhatsAppContacts } from "@/server/whatsapp/contacts";
import { resolveSendableWhatsAppGroups } from "@/server/whatsapp/sendable-groups";
import { uniqueSelectedGroupIds, uniqueGroupDeliveryTargets } from "@/server/messages/unique-targets";

const schema = z.object({
  groupIds: z.array(z.string()).default([]),
  categoryIds: z.array(z.string()).default([]),
  contactIds: z.array(z.string()).default([]),
});

export async function POST(request: Request) {
  try {
    const { company, user } = await requireApiSession();
    const body = schema.parse(await request.json());
    const account = await resolveCurrentWhatsAppAccount({ companyId: company.id, userId: user.id });
    if (!account) return NextResponse.json({ error: "WHATSAPP_ACCOUNT_REQUIRED", message: "WhatsApp hesabınızı bağlayın." }, { status: 409 });

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
    const ids = uniqueSelectedGroupIds(body.groupIds, links);
    const groups = uniqueGroupDeliveryTargets(await resolveSendableWhatsAppGroups(company.id, ids, { userId: user.id, accountId: account.id }));
    const categoryContactResolution = await resolveCategoryContactsForSend(
      { companyId: company.id, userId: user.id, accountId: account.id },
      body.categoryIds,
    );
    if ((body.contactIds.length || categoryContactResolution.assignedCount) && !(await subscriptionAccess.canUseContactMessaging(company.id))) {
      return NextResponse.json({ error: "CONTACT_MESSAGING_REQUIRES_PROFESSIONAL" }, { status: 403 });
    }
    const directContacts = await resolveOwnedWhatsAppContacts(
      { companyId: company.id, userId: user.id, accountId: account.id },
      body.contactIds,
    );
    const contactsByIdentity = new Map<string, (typeof directContacts)[number]>();
    for (const contact of [...directContacts, ...categoryContactResolution.contacts]) {
      contactsByIdentity.set(`${contact.accountId}:${contact.externalContactId}`, contact);
    }
    const contacts = [...contactsByIdentity.values()];
    return NextResponse.json({
      groups: groups.sort((a, b) => a.name.localeCompare(b.name, "tr")),
      contacts,
      count: groups.length + contacts.length,
      groupCount: groups.length,
      contactCount: contacts.length,
      skippedStaleContactCount: categoryContactResolution.skippedStaleCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    const ownershipMismatch = message === "WHATSAPP_GROUP_OWNERSHIP_MISMATCH" || message === "WHATSAPP_CONTACT_OWNERSHIP_MISMATCH";
    return NextResponse.json({ error: ownershipMismatch ? message : "UNAUTHORIZED" }, { status: ownershipMismatch ? 403 : 401 });
  }
}
