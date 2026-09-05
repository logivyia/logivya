import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  fallbackWhatsAppGroupName,
  normalizeWhatsAppGroupMetadata,
} from "../src/server/whatsapp/group-sync-normalization";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const screen = read("apps/mobile/src/screens/app/whatsapp-screen.tsx");
const groupsScreen = read("apps/mobile/src/screens/app/groups-screen.tsx");
const groupsStore = read("apps/mobile/src/features/groups/groupsStore.ts");
const groupsClient = read("apps/mobile/src/api/mobileGroups.ts");
const contactsClient = read("apps/mobile/src/api/mobileContacts.ts");
const groupsRoute = read("src/app/api/mobile/groups/sync-current/route.ts");
const contactsRoute = read("src/app/api/mobile/whatsapp/contacts/sync-current/route.ts");
const contactsListingRoute = read("src/app/api/mobile/whatsapp/contacts/route.ts");
const worker = read("src/worker/index.ts");
const provider = read("src/worker/baileys-provider.ts");

assert.match(screen, /handleRefreshGroups/);
assert.match(screen, /handleRefreshContacts/);
assert.match(screen, /syncCurrentMobileGroups\(account\.id\)/);
assert.match(screen, /syncMobileContacts\(account\.id\)/);
assert.match(screen, /getMobileContacts\(\{ accountId: account\.id/);
assert.match(screen, /whatsappRefreshWithoutDisconnect/);
assert.match(screen, /label=\{syncingResource === "groups"/);
assert.match(screen, /label=\{syncingResource === "contacts"/);
assert.match(groupsScreen, /setPlatformFilter\(route\.params\?\.initialPlatform \?\? "ALL"\)/);
assert.match(groupsScreen, /refreshAllGroups/);
assert.match(groupsStore, /filters: defaultFilters/);
assert.match(groupsStore, /syncWarning/);
assert.match(groupsStore, /getAllMobileGroups\(\)/);
assert.match(groupsClient, /export async function getAllMobileGroups/);
assert.match(groupsClient, /response\.pageInfo\.hasMore/);
assert.match(groupsClient, /seenCursors/);

assert.match(groupsClient, /syncCurrentMobileGroups\(accountId\?: string\)/);
assert.match(groupsClient, /\/api\/mobile\/groups\/sync-current", \{ accountId \}/);
assert.match(contactsClient, /accountId\?: string/);
assert.match(contactsClient, /query\.set\("accountId", params\.accountId\)/);

assert.match(groupsRoute, /listRecoverableWhatsAppAccounts\(scope, \{/);
assert.match(groupsRoute, /accountId,/);
assert.match(groupsRoute, /requireConnected: true/);
assert.match(contactsRoute, /requestCurrentAccountContactSync/);
assert.match(contactsRoute, /body\.accountId/);
assert.match(contactsListingRoute, /accountId: url\.searchParams\.get\("accountId"\)/);

assert.match(worker, /if \(action === "sync"\) return await provider\.syncGroups\(accountId\)/);
assert.match(worker, /const result = await provider\.syncContacts\(accountId\)/);
assert.match(worker, /sync_failed_without_connection_downgrade/);
assert.match(provider, /async syncGroups\(accountId: string\)/);
assert.match(provider, /const socket = await this\.ensureConnectedSocket\(accountId\)/);
assert.match(provider, /socket\.groupMetadata\(group\.id\)/);
assert.match(provider, /normalizeWhatsAppGroupMetadata/);
assert.match(provider, /groupsFallbackNameCount/);
assert.match(provider, /async syncContacts\(accountId: string\)/);

const missingSubject = normalizeWhatsAppGroupMetadata({
  id: "120363000000000000@g.us",
  subject: undefined,
  participants: [],
});
assert.equal(missingSubject?.name, fallbackWhatsAppGroupName("120363000000000000@g.us"));
assert.equal(missingSubject?.nameSource, "FALLBACK");

const hydratedSubject = normalizeWhatsAppGroupMetadata(
  { id: "120363000000000001@g.us", subject: undefined, participants: [] },
  {
    detailed: {
      id: "120363000000000001@g.us",
      subject: "  Yeni grup  ",
      participants: [{}, {}],
    },
  },
);
assert.equal(hydratedSubject?.name, "Yeni grup");
assert.equal(hydratedSubject?.participantCount, 2);
assert.equal(hydratedSubject?.nameSource, "DIRECT_METADATA");

console.log("Mobile WhatsApp directory refresh contract checks passed.");
