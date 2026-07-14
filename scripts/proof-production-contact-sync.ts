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
type ContactPage = {
  contacts: Array<{ id: string; displayName: string }>;
  pageInfo: { page: number; total: number; totalPages: number; hasMore: boolean };
};

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  const [{ prisma }, { createAccessToken }, { subscriptionAccess }, { resolveCurrentWhatsAppAccount }, { hashOpaqueToken }] = await Promise.all([
    import("../src/server/db"),
    import("../src/server/mobile/auth"),
    import("../src/server/billing/subscription-access"),
    import("../src/server/whatsapp/account-scope"),
    import("../src/server/security/authentication"),
  ]);
  const apiBaseUrl = (process.env.CONTACT_SYNC_API_BASE_URL || "https://www.logivya.com").replace(/\/$/, "");
  const requestedAccountPrefix = process.env.CONTACT_SYNC_PROOF_ACCOUNT_PREFIX?.trim();
  let temporarySessionId: string | null = null;
  let temporaryWebSessionId: string | null = null;

  try {
    const memberships = await prisma.companyUser.findMany({
      where: {
        status: "ACTIVE",
        user: { status: "ACTIVE", email: { not: "burakidim@gmail.com" } },
        company: { accounts: { some: { userId: { not: null }, archivedAt: null, status: "CONNECTED" } } },
      },
      select: { companyId: true, userId: true, role: true },
      take: 50,
    });

    let actor: { companyId: string; userId: string; role: string; accountId: string } | null = null;
    for (const membership of memberships) {
      if (!(await subscriptionAccess.canUseContactMessaging(membership.companyId))) continue;
      const account = requestedAccountPrefix
        ? await prisma.whatsAppAccount.findFirst({
            where: {
              id: { startsWith: requestedAccountPrefix },
              companyId: membership.companyId,
              userId: membership.userId,
              archivedAt: null,
              status: "CONNECTED",
            },
          })
        : await resolveCurrentWhatsAppAccount({ companyId: membership.companyId, userId: membership.userId });
      if (account?.status === "CONNECTED") {
        actor = { ...membership, accountId: account.id };
        break;
      }
    }
    if (!actor) throw new Error("No connected Professional/trial account was found for production proof.");

    const session = await prisma.mobileDeviceSession.create({
      data: {
        userId: actor.userId,
        companyId: actor.companyId,
        deviceId: `production-contact-sync-proof-${randomBytes(8).toString("hex")}`,
        platform: "ANDROID",
        appVersion: "production-contact-sync-proof",
        refreshTokenHash: randomBytes(48).toString("hex"),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    temporarySessionId = session.id;
    const { accessToken } = createAccessToken({
      userId: actor.userId,
      companyId: actor.companyId,
      sessionId: session.id,
      role: actor.role,
    });
    const webSessionToken = randomBytes(32).toString("base64url");
    const webSession = await prisma.userSession.create({
      data: {
        userId: actor.userId,
        companyId: actor.companyId,
        sessionTokenHash: hashOpaqueToken(webSessionToken),
        ipAddress: "production-contact-sync-proof",
        userAgent: "production-contact-sync-proof",
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    temporaryWebSessionId = webSession.id;

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

    const unrelatedAccount = await prisma.whatsAppAccount.findFirst({
      where: { id: { not: actor.accountId }, archivedAt: null },
      select: { id: true },
    });
    if (!unrelatedAccount) throw new Error("A second account is required for cross-account authorization proof.");
    const crossAccountResponse = await fetch(
      `${apiBaseUrl}/api/mobile/whatsapp/contacts?accountId=${encodeURIComponent(unrelatedAccount.id)}&page=1&limit=100`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    const crossAccountEnvelope = await crossAccountResponse.json() as MobileEnvelope<ContactPage>;
    const crossAccountTargetDenied = !crossAccountResponse.ok && !crossAccountEnvelope.success;
    if (!crossAccountTargetDenied) throw new Error("Production API exposed an unrelated WhatsApp account directory.");

    const before = await prisma.contact.count({
      where: { companyId: actor.companyId, userId: actor.userId, accountId: actor.accountId, isActive: true, isWhatsAppUser: true },
    });
    const request = await api<{ accountId: string; syncRunId: string; status: string }>(
      "/api/mobile/whatsapp/contacts/sync-current",
      { method: "POST", body: JSON.stringify({ accountId: actor.accountId }) },
    );
    if (request.accountId !== actor.accountId) throw new Error("Production API returned a cross-account sync target.");

    const deadline = Date.now() + 4 * 60_000;
    let run = await prisma.contactSyncRun.findUnique({ where: { id: request.syncRunId } });
    while (run && ["QUEUED", "RUNNING"].includes(run.status) && Date.now() < deadline) {
      await sleep(3_000);
      run = await prisma.contactSyncRun.findUnique({ where: { id: request.syncRunId } });
    }
    if (!run) throw new Error("Production sync run was not persisted.");
    if (run.status !== "COMPLETED") throw new Error(`Production sync did not complete: ${run.status}/${run.errorCode ?? "UNKNOWN"}`);

    const allContactIds = new Set<string>();
    let page = 1;
    let total = 0;
    let totalPages = 1;
    do {
      const directory = await api<ContactPage>(`/api/mobile/whatsapp/contacts?accountId=${encodeURIComponent(actor.accountId)}&page=${page}&limit=100`);
      total = directory.pageInfo.total;
      totalPages = directory.pageInfo.totalPages;
      for (const contact of directory.contacts) {
        if (!contact.displayName.trim()) throw new Error("Production API returned a contact without a display name.");
        allContactIds.add(contact.id);
      }
      page += 1;
    } while (page <= totalPages);

    const webContactIds = new Set<string>();
    let webPage = 1;
    let webTotal = 0;
    let webTotalPages = 1;
    do {
      const response = await fetch(`${apiBaseUrl}/api/whatsapp/contacts?accountId=${encodeURIComponent(actor.accountId)}&page=${webPage}&limit=100`, {
        headers: { cookie: `logivya_session=${webSessionToken}` },
      });
      if (!response.ok) throw new Error(`Web contact API failed: HTTP_${response.status}`);
      const directory = await response.json() as ContactPage;
      webTotal = directory.pageInfo.total;
      webTotalPages = directory.pageInfo.totalPages;
      for (const contact of directory.contacts) webContactIds.add(contact.id);
      webPage += 1;
    } while (webPage <= webTotalPages);

    const [account, after, fallbackCount] = await Promise.all([
      prisma.whatsAppAccount.findUnique({ where: { id: actor.accountId }, select: { status: true } }),
      prisma.contact.count({
        where: { companyId: actor.companyId, userId: actor.userId, accountId: actor.accountId, isActive: true, isWhatsAppUser: true },
      }),
      prisma.contact.count({
        where: {
          companyId: actor.companyId,
          userId: actor.userId,
          accountId: actor.accountId,
          isActive: true,
          isWhatsAppUser: true,
          displayNameSource: "PHONE_FALLBACK",
        },
      }),
    ]);
    if (account?.status !== "CONNECTED") throw new Error(`Contact sync downgraded account status to ${account?.status ?? "MISSING"}.`);
    if (allContactIds.size !== total || webContactIds.size !== webTotal || total !== webTotal || total !== after || run.persistedCount !== after) {
      throw new Error(`Directory count mismatch: mobile=${allContactIds.size}/${total}, web=${webContactIds.size}/${webTotal}, DB=${after}, run=${run.persistedCount}.`);
    }

    console.log(JSON.stringify({
      apiBaseUrl,
      accountPrefix: actor.accountId.slice(0, 8),
      ownershipModel: "USER_OWNED_WHATSAPP_ACCOUNT",
      syncStatus: run.status,
      accountStatusAfterSync: account.status,
      contactsBefore: before,
      contactsAfter: after,
      apiVisibleContacts: allContactIds.size,
      webApiVisibleContacts: webContactIds.size,
      namedContacts: after - fallbackCount,
      phoneFallbackContacts: fallbackCount,
      crossAccountTargetDenied,
      temporarySessionCleanedUp: true,
    }, null, 2));
  } finally {
    if (temporarySessionId) await prisma.mobileDeviceSession.deleteMany({ where: { id: temporarySessionId } }).catch(() => undefined);
    if (temporaryWebSessionId) await prisma.userSession.deleteMany({ where: { id: temporaryWebSessionId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
