import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (key && !process.env[key]) process.env[key] = parts.join("=").replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env.production.local"));
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");

type MobileEnvelope<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } };

async function main() {
  const [{ prisma }, { createAccessToken }, { subscriptionAccess }, { resolveCurrentWhatsAppAccount }] = await Promise.all([
    import("../src/server/db"),
    import("../src/server/mobile/auth"),
    import("../src/server/billing/subscription-access"),
    import("../src/server/whatsapp/account-scope"),
  ]);
  const apiBaseUrl = (process.env.CATEGORY_CONTACT_API_BASE_URL || "https://www.logivya.com").replace(/\/$/, "");
  let temporarySessionId: string | null = null;
  let temporaryCategoryId: string | null = null;
  try {
    const memberships = await prisma.companyUser.findMany({
      where: {
        status: "ACTIVE",
        user: { status: "ACTIVE" },
        company: {
          accounts: { some: { userId: { not: null }, archivedAt: null, contacts: { some: { isActive: true, isWhatsAppUser: true } } } },
        },
      },
      select: { companyId: true, userId: true, role: true },
      take: 30,
    });

    let actor: { companyId: string; userId: string; role: string; accountId: string } | null = null;
    for (const membership of memberships) {
      if (!(await subscriptionAccess.canUseContactMessaging(membership.companyId))) continue;
      const account = await resolveCurrentWhatsAppAccount({ companyId: membership.companyId, userId: membership.userId });
      if (!account) continue;
      const usableContacts = await prisma.contact.count({
        where: {
          companyId: membership.companyId,
          userId: membership.userId,
          accountId: account.id,
          isActive: true,
          isWhatsAppUser: true,
          OR: [{ name: { not: null } }, { pushName: { not: null } }],
        },
      });
      if (usableContacts) {
        actor = { ...membership, accountId: account.id };
        break;
      }
    }
    if (!actor) throw new Error("No active Professional/trial user with synchronized contacts was found for the smoke test.");

    const session = await prisma.mobileDeviceSession.create({
      data: {
        userId: actor.userId,
        companyId: actor.companyId,
        deviceId: `category-contact-proof-${randomBytes(8).toString("hex")}`,
        platform: "ANDROID",
        appVersion: "category-contact-proof",
        refreshTokenHash: randomBytes(48).toString("hex"),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    temporarySessionId = session.id;
    const { accessToken } = createAccessToken({ userId: actor.userId, companyId: actor.companyId, sessionId: session.id, role: actor.role });

    async function api<T>(requestPath: string, init: RequestInit = {}) {
      const response = await fetch(`${apiBaseUrl}${requestPath}`, {
        ...init,
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", ...init.headers },
      });
      const envelope = await response.json() as MobileEnvelope<T>;
      if (!response.ok || !envelope.success) {
        const error = envelope.success ? `HTTP_${response.status}` : `${envelope.error.code}: ${envelope.error.message}`;
        throw new Error(`${requestPath} failed: ${error}`);
      }
      return envelope.data;
    }

    const directory = await api<{
      contacts: Array<{ id: string }>;
      pageInfo: { total: number };
    }>("/api/mobile/whatsapp/contacts?limit=100");
    if (!directory.contacts.length) throw new Error("The selected account returned no user-visible contacts.");
    const contactIds = directory.contacts.map((contact) => contact.id).slice(0, 100);

    const created = await api<{ category: { id: string; assignedContactCount: number } }>("/api/mobile/categories", {
      method: "POST",
      body: JSON.stringify({
        name: `__contact-proof-${Date.now()}`,
        description: "Temporary category contact API proof",
        color: "#f97316",
        groupIds: [],
        contactIds: [contactIds[0]],
      }),
    });
    temporaryCategoryId = created.category.id;
    if (created.category.assignedContactCount !== 1) throw new Error("Single-contact assignment did not persist.");

    const bulk = await api<{ category: { assignedContactCount: number; totalTargetCount: number } }>(`/api/mobile/categories/${temporaryCategoryId}`, {
      method: "PATCH",
      body: JSON.stringify({ contactIds }),
    });
    if (bulk.category.assignedContactCount !== contactIds.length) throw new Error("Bulk contact assignment count mismatch.");

    const persisted = await api<{
      assignedContactIds: string[];
      assignedContactCount: number;
      pageInfo: { total: number; hasMore: boolean };
    }>(`/api/mobile/categories/${temporaryCategoryId}/contacts?limit=50`);
    if (persisted.assignedContactCount !== contactIds.length || !contactIds.every((id) => persisted.assignedContactIds.includes(id))) {
      throw new Error("Assigned contacts did not survive an API reload.");
    }

    const remainingContactIds = contactIds.slice(1);
    const removed = await api<{ category: { assignedContactCount: number } }>(`/api/mobile/categories/${temporaryCategoryId}`, {
      method: "PATCH",
      body: JSON.stringify({ contactIds: remainingContactIds }),
    });
    if (removed.category.assignedContactCount !== remainingContactIds.length) throw new Error("Contact removal did not persist.");

    const list = await api<{ categories: Array<{ id: string; assignedContactCount: number; totalTargetCount: number }> }>("/api/mobile/categories");
    const summary = list.categories.find((category) => category.id === temporaryCategoryId);
    if (!summary || summary.assignedContactCount !== remainingContactIds.length || summary.totalTargetCount !== remainingContactIds.length) {
      throw new Error("Category list contact summary is stale or incorrect.");
    }

    console.log(JSON.stringify({
      apiBaseUrl,
      singleContactAssignment: true,
      requestedBulkContactCount: contactIds.length,
      persistedBulkContactCount: persisted.assignedContactCount,
      contactRemoval: true,
      categorySummaryCount: summary.assignedContactCount,
      availableDirectoryCount: directory.pageInfo.total,
      cleanedUp: true,
    }, null, 2));
  } finally {
    if (temporaryCategoryId) await prisma.category.deleteMany({ where: { id: temporaryCategoryId } }).catch(() => undefined);
    if (temporarySessionId) await prisma.mobileDeviceSession.deleteMany({ where: { id: temporarySessionId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
