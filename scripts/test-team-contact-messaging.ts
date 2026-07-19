import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Plan } from "@prisma/client";

import { deriveCompanyEntitlements } from "../src/server/billing/company-entitlements";
import { calculateCompanySeatUsage, canActivateMembershipSeat, canReserveInvitationSeat } from "../src/server/team/seat-policy";
import {
  normalizeProviderContact,
  normalizeWhatsAppContactJid,
  resolveWhatsAppContactDisplayIdentity,
  resolveWhatsAppContactDisplayName,
} from "../src/server/whatsapp/contact-normalization";
import { mergeNormalizedProviderContact, normalizeWhatsAppAccountIdentity } from "../src/server/whatsapp/contacts";
import { collectGroupParticipantContacts } from "../src/server/whatsapp/group-participant-contacts";

const root = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(file: string) {
  return readFileSync(path.join(root, file), "utf8");
}

function plan(slug: string, maxTeamUsers: number, contactMessagingEnabled: boolean) {
  return {
    slug,
    maxTeamUsers,
    groupMessagingEnabled: true,
    contactMessagingEnabled,
    deleteForEveryoneEnabled: true,
    advertisingEnabled: slug === "trial" || slug === "starter",
    hasScheduledMessages: true,
    hasRecurringMessages: true,
  } as Plan;
}

const trial = deriveCompanyEntitlements(plan("trial", 1, true), true);
const starter = deriveCompanyEntitlements(plan("starter", 2, false), true);
const professional = deriveCompanyEntitlements(plan("professional", 3, true), true);
const inactiveProfessional = deriveCompanyEntitlements(plan("professional", 3, true), false);
assert(trial.teamSeats === 1 && trial.contactMessaging, "Seven-day trial must have one seat and explicit contact access.");
assert(starter.teamSeats === 2 && starter.groupMessaging && !starter.contactMessaging, "Starter must have two seats and remain group-only.");
assert(professional.teamSeats === 3 && professional.groupMessaging && professional.contactMessaging, "Professional must have three seats and contact access.");
assert(!inactiveProfessional.messageSend && !inactiveProfessional.contactMessaging, "Inactive subscriptions must not retain message entitlements.");

const starterOwner = calculateCompanySeatUsage({ limit: 2, activeMembers: 1, legacyInvitedMembers: 0, pendingInvitations: 0 });
assert(canReserveInvitationSeat(starterOwner, false), "Starter owner must be able to reserve the second seat.");
const starterFull = calculateCompanySeatUsage({ limit: 2, activeMembers: 1, legacyInvitedMembers: 0, pendingInvitations: 1 });
assert(!canReserveInvitationSeat(starterFull, false), "Starter must reject a second pending invitation.");
assert(canReserveInvitationSeat(starterFull, true), "Resending an existing pending invitation must not consume another seat.");
const professionalFull = calculateCompanySeatUsage({ limit: 3, activeMembers: 1, legacyInvitedMembers: 0, pendingInvitations: 2 });
assert(!canReserveInvitationSeat(professionalFull, false), "Professional must reject a third invited member.");
const professionalAcceptance = calculateCompanySeatUsage({ limit: 3, activeMembers: 2, legacyInvitedMembers: 0, pendingInvitations: 1 });
assert(canActivateMembershipSeat(professionalAcceptance), "A reserved Professional invitation must be accepted while one membership seat remains.");
const downgradedFull = calculateCompanySeatUsage({ limit: 2, activeMembers: 2, legacyInvitedMembers: 0, pendingInvitations: 1 });
assert(!canActivateMembershipSeat(downgradedFull), "An invitation must not overfill a downgraded plan.");
assert(canActivateMembershipSeat(downgradedFull, "INVITED"), "Legacy invited memberships already reserve their seat.");

assert(normalizeWhatsAppContactJid("+905551112233")?.jid === "905551112233@s.whatsapp.net", "Phone numbers must normalize to a WhatsApp contact JID.");
assert(normalizeWhatsAppContactJid("905551112233@s.whatsapp.net")?.phone === "905551112233", "Existing contact JIDs must be preserved.");
assert(normalizeWhatsAppContactJid("123456789@lid")?.jid === "123456789@lid", "Modern LID contact targets must remain sendable without exposing the opaque ID as a phone number.");
assert(normalizeWhatsAppContactJid("120363000000@g.us") === null, "Group JIDs must never enter the contact model.");
assert(normalizeWhatsAppContactJid("status@broadcast") === null, "Broadcast JIDs must never enter the contact model.");
assert(
  normalizeProviderContact({ id: "123456789@lid", phoneNumber: "905551112233@s.whatsapp.net", name: "Saved Name" })?.name === "Saved Name",
  "Modern LID contacts must normalize through their phone-number JID without losing the saved name.",
);
const nativeLidContact = normalizeProviderContact({ id: "123456789@lid", name: "Saved LID Name" });
assert(nativeLidContact?.externalContactId === "123456789@lid" && nativeLidContact.phone === "" && nativeLidContact.displayName === "Saved LID Name", "Named LID contacts must remain selectable and sendable while their phone alias is unavailable.");
assert(normalizeProviderContact({ id: "123456789@lid" }) === null, "Unnamed opaque LID records must not create blank contact rows.");
assert(normalizeProviderContact({ id: "905551112233@s.whatsapp.net", notify: "  Test Kişisi  " })?.pushName === "Test Kişisi", "Contact display data must be trimmed and normalized.");
assert(normalizeProviderContact({ id: "905551112233@s.whatsapp.net", name: "+90 555 111 22 33" })?.name === null, "Raw phone numbers must never become contact display names.");
assert(normalizeProviderContact({ id: "905551112233@s.whatsapp.net", notify: "905551112233@s.whatsapp.net" })?.pushName === null, "Raw WhatsApp JIDs must never become contact display names.");
assert(resolveWhatsAppContactDisplayName({ phone: "905551112233", name: "Saved Name", pushName: null }) === "Saved Name", "Saved contact names must remain user-visible.");
assert(resolveWhatsAppContactDisplayName({ phone: "905551112233", name: "905551112233", pushName: null }) === "+905551112233", "A valid phone-only contact must remain visible through normalized phone fallback.");
const unicodeContactName = "J\u00f6rg \u00c7a\u011flar";
assert(resolveWhatsAppContactDisplayName({ phone: "491701234567", name: unicodeContactName, pushName: null }) === unicodeContactName, "Unicode contact names must remain intact.");
assert(resolveWhatsAppContactDisplayName({ phone: "8613812345678", name: "李小龙", pushName: null }) === "李小龙", "International Unicode contact names must remain intact.");
assert(resolveWhatsAppContactDisplayName({ phone: "905551112233", name: "undefined", pushName: null }) === "+905551112233", "Invalid provider placeholders must fall back to the normalized phone number.");
assert(resolveWhatsAppContactDisplayName({ phone: "905551112233", displayName: "Persisted Contact" }) === "Persisted Contact", "A valid legacy persisted display name must survive when provenance is unavailable.");
const namedDuplicate = normalizeProviderContact({ id: "905551112233@s.whatsapp.net", name: "Kayıtlı Kişi" });
const unnamedDuplicate = normalizeProviderContact({ id: "905551112233@s.whatsapp.net" });
assert(namedDuplicate && unnamedDuplicate, "Direct provider contacts must normalize before duplicate merging.");
assert(mergeNormalizedProviderContact(namedDuplicate, unnamedDuplicate).displayName === "Kayıtlı Kişi", "A later unnamed duplicate must not overwrite a stronger saved name.");
assert(
  resolveWhatsAppContactDisplayIdentity({
    phone: "905551112233",
    name: "Saved Name",
    notifyName: "Weaker Notify",
    verifiedName: "Verified Business",
  }).displayNameSource === "SAVED_NAME",
  "A weaker provider name must never replace a saved address-book name.",
);
assert(normalizeWhatsAppAccountIdentity("905551112233:4@s.whatsapp.net") === "905551112233", "Connected device identities must normalize to their phone identity.");
const participantContacts = collectGroupParticipantContacts([
  { participants: [
    { id: "111111111111@s.whatsapp.net" },
    { id: "222222222222@lid", jid: "222222222222@s.whatsapp.net" },
    { id: "111111111111@s.whatsapp.net" },
    { id: "120363000000@g.us" },
  ] },
], {
  ownJid: "111111111111:4@s.whatsapp.net",
  knownContacts: [{ id: "222222222222@s.whatsapp.net", notify: "Known Person" }],
});
assert(participantContacts.length === 1, "Group participant contacts must be deduplicated and exclude the connected account.");
assert(participantContacts[0]?.jid === "222222222222@s.whatsapp.net", "LID participants must use their phone-number JID.");
assert(participantContacts[0]?.notify === "Known Person", "Known contact display data must enrich group participants.");

for (const contactCount of [14, 317, 2_000]) {
  const completeDirectory = collectGroupParticipantContacts([{
    participants: Array.from({ length: contactCount }, (_, index) => ({ id: `${900000000000 + index}@s.whatsapp.net`, name: `Contact ${index}` })),
  }]);
  assert(completeDirectory.length === contactCount, `Contact collection must not truncate a ${contactCount}-contact directory.`);
}

for (const route of [
  "src/app/api/company/invitations/route.ts",
  "src/app/api/company/invitations/[identifier]/route.ts",
  "src/app/api/company/invitations/[identifier]/accept/route.ts",
  "src/app/api/company/invitations/code/accept/route.ts",
  "src/app/api/company/members/route.ts",
  "src/app/api/company/members/[id]/route.ts",
  "src/app/api/whatsapp/contacts/route.ts",
  "src/app/api/whatsapp/contacts/sync-current/route.ts",
  "src/app/api/mobile/whatsapp/contacts/route.ts",
  "src/app/api/mobile/whatsapp/contacts/sync-current/route.ts",
  "src/app/api/mobile/company/invitations/code/accept/route.ts",
]) {
  assert(existsSync(path.join(root, route)), `Required route is missing: ${route}`);
}

const invitations = read("src/server/team/company-invitations.ts");
assert(invitations.includes("FOR UPDATE"), "Seat reservation and acceptance must lock the company row.");
assert(invitations.includes("randomBytes(32)"), "Invitation tokens must use at least 256 bits of randomness.");
assert(invitations.includes("tokenHash"), "Only the invitation token hash may be stored.");
assert(invitations.includes("shortCodeHash: null"), "New invitations must not issue manual invitation codes.");
assert(invitations.includes("queueInvitationDelivery"), "Invitation email delivery must be committed through an outbox.");
assert(invitations.includes("INVITATION_LIFETIME_MS = 72"), "Invitation links must expire after 72 hours.");
assert(invitations.includes('status: "EXPIRED"'), "Expired pending invitations must release their seats.");
assert(invitations.includes('"INVITATION_ALREADY_USED"'), "Accepted invitations must be rejected on reuse.");
assert(invitations.includes('"SEAT_LIMIT_REACHED"'), "Seat overflow must use an explicit machine-readable error.");
assert(invitations.includes("enforceOperationRateLimit"), "Invitation creation must be rate limited by the backend.");
assert(!invitations.includes("temporaryPassword"), "Invitation creation must never create placeholder passwords.");

for (const registration of ["src/app/api/auth/register/route.ts", "src/app/api/mobile/auth/register/route.ts"]) {
  const source = read(registration);
  assert(source.includes("acceptCompanyInvitationInTransaction"), `${registration} must join the invited company transactionally.`);
  assert(source.includes("createPendingTrialEntitlement"), `${registration} must use the identity-bound trial candidate service for new owners.`);
  assert(source.indexOf("await createPendingTrialEntitlement") > source.indexOf("if (invitation)"), `${registration} must not create a trial candidate in the invitation branch.`);
}

const contacts = read("src/server/whatsapp/contacts.ts");
assert(contacts.includes("companyId: scope.companyId"), "Contact queries must enforce company scope.");
assert(contacts.includes("userId: scope.userId"), "Contact queries must enforce user scope.");
assert(contacts.includes("accountId: scope.accountId"), "Contact queries must enforce account scope.");
assert(contacts.includes("Math.min(100"), "Contact pagination must have a hard server-side page limit.");
assert(contacts.includes("search?.trim().slice(0, 100)"), "Contact search input must be bounded.");
assert(contacts.includes("whatsapp.contacts.persist_skipped_empty"), "An empty provider payload must not be recorded as a successful contact sync.");
assert(contacts.indexOf("if (!normalizedContacts.length)") < contacts.indexOf("lastContactSyncAt: syncedAt"), "Empty contact payloads must exit before the successful sync timestamp is written.");
assert(contacts.includes("contact.name ?? previous?.name"), "Partial provider payloads must not erase an existing saved contact name.");
assert(contacts.includes("contact.pushName ?? previous?.pushName"), "Partial provider payloads must not erase an existing WhatsApp push name.");
assert(contacts.includes("displayNameSource"), "The backend must persist the authoritative contact display-name source.");
assert(contacts.includes("contactSyncRun"), "Contact refresh requests must have durable synchronization-run state.");
assert(read("prisma/schema.prisma").includes("contactSyncImplementation"), "Accounts must record the last completed contact-sync implementation for one-time existing-session repair.");
assert(contacts.includes("CONTACT_PERSISTENCE_BATCH_SIZE = 40"), "Large contact directories must persist in transaction-safe batches without imposing a total-contact limit.");
assert(contacts.includes("mergeNormalizedProviderContact"), "Duplicate provider rows must merge without dropping a stronger saved name.");
assert(!contacts.includes("externalContactId: { notIn: normalizedContacts"), "A partial provider snapshot must never deactivate previously authorized contacts.");
assert(!contacts.includes('{ OR: [{ name: { not: null } }, { pushName: { not: null } }] }'), "Phone-fallback contacts must not be removed from the user-facing directory.");

const baileysProvider = read("src/worker/baileys-provider.ts");
assert(baileysProvider.includes('CONTACT_SYNC_IMPLEMENTATION = "CONTACT_DIRECTORY_V15_NON_DESTRUCTIVE_RECONCILIATION"'), "Contact sync jobs must expose their deployed implementation marker for production verification.");
assert(baileysProvider.includes("contactSyncUpgradeRequired"), "Restored sessions on an older contact-sync implementation must queue a one-time reconciliation.");
assert(baileysProvider.includes("contactSyncImplementation: CONTACT_SYNC_IMPLEMENTATION"), "Only a completed reconciliation may advance the account contact-sync implementation marker.");
assert(baileysProvider.includes('mode === "PAIR_PHONE" || mode === "PAIR_QR"'), "Every fresh QR or phone pairing must request complete contact history.");
assert(baileysProvider.includes("syncFullHistory: syncContactHistory"), "Contact bootstrap must explicitly request supported Baileys history sync data.");
assert(baileysProvider.includes('CONTACT_APP_STATE_COLLECTIONS = ["critical_unblock_low", "regular"]'), "Contact bootstrap must fetch both saved contacts and PN-for-LID aliases.");
assert(baileysProvider.includes("socket.resyncAppState([...CONTACT_APP_STATE_COLLECTIONS], true)"), "Existing sessions must request fresh contact and LID mapping app-state snapshots before reconnect fallback.");
assert(baileysProvider.indexOf("socket.ev.flush()", baileysProvider.indexOf("socket.resyncAppState([...CONTACT_APP_STATE_COLLECTIONS], true)")) > baileysProvider.indexOf("socket.resyncAppState([...CONTACT_APP_STATE_COLLECTIONS], true)"), "Manual app-state sync must flush Baileys buffered contact events before reading persistence results.");
assert(baileysProvider.includes("whatsapp.contacts.connection_open_sync_queued"), "Connected accounts must automatically enqueue background contact synchronization without an admin-only branch.");
assert(baileysProvider.includes("flushContactPersistence(accountId)"), "A completed app-state request must wait for every contact persistence batch.");
assert(baileysProvider.includes("collectGroupParticipantContacts(metadata"), "App-state contacts must be supplemented with account-owned group participant metadata.");
assert(baileysProvider.includes('this.startSession(accountId, "RECONNECT", { syncContactHistory: true })'), "A missing persistent contact directory must use the isolated contact-history reconnect path.");
assert(baileysProvider.includes('"whatsapp.contacts.full_sync_started"'), "A manual refresh must run a full contact app-state sync even when fallback contacts already exist.");
assert(baileysProvider.includes("contactPhoneJidsByLid"), "Contact sync must retain LID-to-phone mappings across partial events.");
assert(baileysProvider.includes('keys.set({ "lid-mapping": values })'), "LID-to-phone mappings must survive worker restarts in the account-owned auth state.");
assert(baileysProvider.includes("hydrateLidMappingsFromSession"), "Restored sessions must resolve buffered LID contacts from persistent reverse mappings.");
assert(baileysProvider.includes('source: "BAILEYS_FULL_APP_STATE"'), "App-state contacts must be persisted for existing-session repair.");
assert(!baileysProvider.includes('fullSync: true'), "Baileys app-state deltas must never be treated as a complete physical address book.");
assert(baileysProvider.includes('!contact.externalContactId.endsWith("@lid")'), "Opaque LID targets must not be misinterpreted as phone numbers by availability lookup.");
assert(baileysProvider.includes("normalizableSnapshotCount"), "Production contact sync must expose privacy-safe normalization diagnostics.");
assert(baileysProvider.includes("appStateSyncError"), "Production contact sync must make app-state persistence failures auditable.");
assert(baileysProvider.includes('on(event: "lid-mapping.update"'), "The worker must consume official Baileys LID mapping events for every account.");
assert(baileysProvider.includes('socket.ev.on("chats.phoneNumberShare"'), "Phone-number share events must resolve modern LID contacts.");
assert(baileysProvider.includes("bootstrap_deferred_active_delivery"), "Contact bootstrap must not interrupt an active message delivery.");
assert(baileysProvider.includes("CONTACT_BOOTSTRAP_ACTIVE_DELIVERY_WINDOW_MS"), "Only recent active deliveries may defer contact bootstrap.");
assert(baileysProvider.includes("HISTORY_FALLBACK_SPARSE_NAMES"), "Sparse named directories must receive the guarded history fallback.");
assert(baileysProvider.includes("CONTACT_HISTORY_FALLBACK_COOLDOWN_MS"), "Sparse history fallback must be protected from reconnect loops.");
assert(baileysProvider.includes("resetWhatsAppContactDirectoryIfIdentityChanged"), "A newly connected phone identity must not inherit another phone's contacts.");
assert(baileysProvider.includes("updatedAt: { gte:"), "Stale SENDING rows must not block contact bootstrap forever.");
assert(baileysProvider.includes("availabilityByJid.has(contact.externalContactId)"), "Partial availability responses must leave unreturned contacts unchanged.");
assert(!baileysProvider.includes("available.has(contact.externalContactId)"), "Partial availability responses must not deactivate every omitted contact.");
assert(baileysProvider.includes("where: { accountId, userId: account.userId, isActive: true }"), "Availability verification must never reactivate contacts from a previous phone identity.");
assert(!baileysProvider.includes("take: 10_000"), "Contact availability verification must not stop at an arbitrary total-contact limit.");
assert(baileysProvider.includes("let contactCursor"), "Large contact directories must be verified through unbounded cursor pages.");

const pairingFlow = read("src/server/whatsapp/pairing-code-flow.ts");
assert(pairingFlow.includes("resetWhatsAppContactDirectoryIfIdentityChanged"), "Phone pairing must deactivate a previous phone's directory before account reuse.");

const baileysPatch = read("scripts/patch-baileys-contact-jid.mjs");
assert(baileysPatch.includes("LOGIVYA_CONTACT_PN_JID_COMPAT"), "The pinned Baileys 6.x build must retain modern contactAction PN JIDs.");
const baileysMessageSend = read("node_modules/@whiskeysockets/baileys/lib/Socket/messages-send.js");
assert(baileysMessageSend.includes("const isLid = server === 'lid'"), "The pinned Baileys transport must support direct native LID message targets.");
assert(baileysPatch.includes("LOGIVYA_HISTORY_LID_PN_COMPAT"), "History contacts must resolve official phone-number-to-LID mappings.");
assert(baileysPatch.includes("LOGIVYA_LID_MAPPING_EVENT_COMPAT"), "Modern app-state PN-for-LID actions must be exported to the worker.");
assert(baileysPatch.includes("LOGIVYA_HISTORY_LID_MAPPING_EXPORT"), "Every history LID mapping must be exported for persistent storage.");
assert(baileysPatch.includes("LOGIVYA_LID_MIGRATION_MAPPING_SYNC_COMPAT"), "The pinned Baileys build must decode the official LID migration payload.");
assert(read("package.json").includes("node scripts/patch-baileys-contact-jid.mjs"), "Dependency installation must fail closed unless the Baileys contact compatibility patch applies.");
assert(read("Dockerfile.worker").includes("COPY scripts/patch-baileys-contact-jid.mjs"), "The production worker image must include the Baileys compatibility patch before npm ci.");

const pipeline = read("src/server/messages/delivery-pipeline.ts");
assert(pipeline.includes('traceMessageStage("subscription.contact_access"'), "Contact entitlement must be checked before contact ownership resolution.");
assert(pipeline.includes('targetType: "GROUP"'), "Group recipients must persist GROUP target type.");
assert(pipeline.includes('targetType: "CONTACT"'), "Contact recipients must persist CONTACT target type.");
assert(pipeline.includes("resolveOwnedWhatsAppContacts"), "Contact targets must resolve through the account-scoped ownership service.");

const worker = read("src/worker/index.ts");
assert(worker.includes("provider.sendGroupMessage"), "Stable group delivery branch must remain present.");
assert(worker.includes("provider.sendContactMessage"), "Worker must have an explicit contact delivery branch.");
assert(worker.includes("CONTACT_MESSAGING_REQUIRES_PROFESSIONAL"), "Worker must recheck contact entitlement.");
assert(worker.includes("WHATSAPP_CONTACT_OWNERSHIP_MISMATCH"), "Worker must recheck contact ownership.");
assert(worker.includes("provider.deleteContactMessage"), "Contact Delete for Everyone must use the original contact target.");
assert(worker.includes("sync_failed_without_connection_downgrade"), "Contact-sync failures must not downgrade a healthy WhatsApp connection.");
assert(worker.includes('action === "sync-contacts" ? 15 * 60_000'), "Full contact sync must retain the account-scoped distributed lock for long directories.");

const migration = read("prisma/migrations/20260711152000_team_seats_professional_contact_messaging/migration.sql");
assert(migration.includes("MessageRecipient_typed_target_check"), "Migration must enforce group/contact target integrity.");
assert(migration.includes('WHEN "slug" = \'starter\' THEN 2'), "Migration must assign two Starter seats.");
assert(migration.includes('WHEN "slug" = \'professional\' THEN 3'), "Migration must assign three Professional seats.");
assert(!/UPDATE\s+"Subscription"/i.test(migration), "Migration must not overwrite paid subscriptions.");
const hardeningMigration = read("prisma/migrations/20260711210000_enterprise_subscription_invitation_hardening/migration.sql");
assert(hardeningMigration.includes("CompanyInvitation_one_pending_email_per_company"), "Migration must prevent duplicate live pending invitations.");
assert(hardeningMigration.includes('"attemptCount"'), "Migration must persist per-target delivery attempt counts.");
const contactSyncMigration = read("prisma/migrations/20260713160000_professional_contact_sync_isolation/migration.sql");
assert(contactSyncMigration.includes('CREATE TABLE "ContactSyncRun"'), "Migration must add durable contact synchronization runs.");
assert(contactSyncMigration.includes('"Contact_accountId_isActive_displayName_idx"'), "Migration must index account-scoped contact listing.");
assert(!/DELETE\s+FROM\s+"Contact"/i.test(contactSyncMigration), "Contact synchronization migration must not delete production contacts.");

const localizedContactUiContracts = [
  {
    file: "src/components/campaign-composer-page.tsx",
    selectVisible: 't("composer.selectVisibleContacts")',
    loadMore: 't("composer.loadMoreContacts")',
    professionalLock: 't("composer.contactMessagingProfessional")',
  },
  {
    file: "apps/mobile/src/screens/app/messaging-screen.tsx",
    selectVisible: 't("selectVisibleContacts")',
    loadMore: 't("loadMoreContacts")',
    professionalLock: 't("professionalContactsRequired")',
  },
];

for (const ui of localizedContactUiContracts) {
  const source = read(ui.file);
  assert(source.includes(ui.selectVisible), `${ui.file} must support localized visible contact selection.`);
  assert(source.includes(ui.loadMore), `${ui.file} must support localized paginated contact loading.`);
  assert(source.includes(ui.professionalLock), `${ui.file} must explain the locked Starter contact feature through localization.`);
  assert(source.includes("attempt < 40"), `${ui.file} must poll the asynchronous contact bootstrap instead of assuming it finishes in 1.2 seconds.`);
  assert(!source.includes("contact.name || contact.pushName || contact.phone"), `${ui.file} must use the normalized backend display name instead of ad hoc raw fields.`);
}
const mobileComposer = read("apps/mobile/src/screens/app/messaging-screen.tsx");
assert(mobileComposer.includes("contactRequestVersionRef"), "Mobile contact search must ignore stale responses.");
assert(mobileComposer.includes("currentSyncAt !== previousSyncAt"), "Mobile refresh must wait for a completed contact sync timestamp.");
assert(!mobileComposer.includes("label={contact.name || contact.pushName || contact.phone}"), "Mobile UI must use the canonical display-name resolver.");
assert(read("apps/mobile/src/api/mobileContacts.ts").includes("getMobileContactDisplayName"), "Mobile contact labels must pass through a dedicated display-name sanitizer.");
assert(read("apps/mobile/src/api/mobileContacts.ts").includes("getMobileContactPhoneLabel"), "Mobile contact rows must hide a duplicate phone subtitle when the primary label is already the phone fallback.");
assert(read("src/components/campaign-composer-page.tsx").includes("contactPhoneLabel"), "Web contact rows must hide duplicate phone fallback subtitles.");
assert(read("src/components/campaign-composer-page.tsx").includes("currentSyncAt !== previousSyncAt"), "Web refresh must wait for a completed contact sync timestamp.");
const releaseAcceptance = (JSON.parse(read("package.json")) as { scripts?: Record<string, string> }).scripts?.["release:acceptance"] ?? "";
const contactDirectoryIndex = releaseAcceptance.indexOf("npm run test:whatsapp-contacts");
const categoryAssignmentIndex = releaseAcceptance.indexOf("npm run test:category-contact-assignment");
const finalGateIndex = releaseAcceptance.indexOf("tsx scripts/release-acceptance-gate.ts");
assert(
  contactDirectoryIndex >= 0 && categoryAssignmentIndex > contactDirectoryIndex && finalGateIndex > categoryAssignmentIndex,
  "The release gate must run contact directory and category assignment contracts before the final evidence gate.",
);

console.log("Team seats, invitation lifecycle, contact privacy, typed delivery and cross-platform UI contracts passed.");
