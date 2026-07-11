import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Plan } from "@prisma/client";

import { deriveCompanyEntitlements } from "../src/server/billing/company-entitlements";
import { calculateCompanySeatUsage, canActivateMembershipSeat, canReserveInvitationSeat } from "../src/server/team/seat-policy";
import { normalizeProviderContact, normalizeWhatsAppContactJid } from "../src/server/whatsapp/contact-normalization";
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
assert(normalizeWhatsAppContactJid("120363000000@g.us") === null, "Group JIDs must never enter the contact model.");
assert(normalizeWhatsAppContactJid("status@broadcast") === null, "Broadcast JIDs must never enter the contact model.");
assert(
  normalizeProviderContact({ id: "123456789@lid", phoneNumber: "905551112233@s.whatsapp.net", name: "Saved Name" })?.name === "Saved Name",
  "Modern LID contacts must normalize through their phone-number JID without losing the saved name.",
);
assert(normalizeProviderContact({ id: "905551112233@s.whatsapp.net", notify: "  Test Kişisi  " })?.pushName === "Test Kişisi", "Contact display data must be trimmed and normalized.");
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
assert(invitations.includes("shortCodeHash"), "Manual invitation codes must be stored only as hashes.");
assert(invitations.includes("INVITATION_CODE_LENGTH = 16"), "Manual invitation codes must retain at least 80 bits from the restricted alphabet.");
assert(invitations.includes('status: "EXPIRED"'), "Expired pending invitations must release their seats.");
assert(invitations.includes('"INVITATION_ALREADY_USED"'), "Accepted invitations must be rejected on reuse.");
assert(invitations.includes('"SEAT_LIMIT_REACHED"'), "Seat overflow must use an explicit machine-readable error.");
assert(invitations.includes("enforceOperationRateLimit"), "Invitation creation must be rate limited by the backend.");
assert(!invitations.includes("temporaryPassword"), "Invitation creation must never create placeholder passwords.");

for (const registration of ["src/app/api/auth/register/route.ts", "src/app/api/mobile/auth/register/route.ts"]) {
  const source = read(registration);
  assert(source.includes("acceptCompanyInvitationInTransaction"), `${registration} must join the invited company transactionally.`);
  assert(source.includes("invitation ? null"), `${registration} must not require or create a separate trial for an invited member.`);
}

const contacts = read("src/server/whatsapp/contacts.ts");
assert(contacts.includes("companyId: scope.companyId"), "Contact queries must enforce company scope.");
assert(contacts.includes("userId: scope.userId"), "Contact queries must enforce user scope.");
assert(contacts.includes("accountId: scope.accountId"), "Contact queries must enforce account scope.");
assert(contacts.includes("Math.min(100"), "Contact pagination must have a hard server-side page limit.");
assert(contacts.includes("search?.trim().slice(0, 100)"), "Contact search input must be bounded.");
assert(contacts.includes("whatsapp.contacts.persist_skipped_empty"), "An empty provider payload must not be recorded as a successful contact sync.");
assert(contacts.indexOf("if (!normalizedContacts.length)") < contacts.indexOf("lastContactSyncAt: syncedAt"), "Empty contact payloads must exit before the successful sync timestamp is written.");
assert(contacts.includes("name: contact.name ?? undefined"), "Partial provider payloads must not erase an existing saved contact name.");
assert(contacts.includes("pushName: contact.pushName ?? undefined"), "Partial provider payloads must not erase an existing WhatsApp push name.");
assert(contacts.includes('{ OR: [{ name: { not: null } }, { pushName: { not: null } }] }'), "The user-facing directory must exclude unnamed group-only fallback records.");

const baileysProvider = read("src/worker/baileys-provider.ts");
assert(baileysProvider.includes('CONTACT_SYNC_IMPLEMENTATION = "CONTACT_DIRECTORY_V6_FULL_APP_STATE"'), "Contact sync jobs must expose their deployed implementation marker for production verification.");
assert(baileysProvider.includes("syncFullHistory: Boolean(options.syncContactHistory)"), "Contact bootstrap must explicitly request supported Baileys history sync data.");
assert(baileysProvider.includes('CONTACT_APP_STATE_COLLECTION = "critical_unblock_low"'), "Contact bootstrap must use the Baileys collection that carries contact actions.");
assert(baileysProvider.includes("socket.resyncAppState([CONTACT_APP_STATE_COLLECTION], true)"), "Existing sessions must request a fresh contact app-state snapshot before reconnect fallback.");
assert(baileysProvider.includes("flushContactPersistence(accountId)"), "A completed app-state request must wait for every contact persistence batch.");
assert(baileysProvider.includes("collectGroupParticipantContacts(metadata"), "App-state contacts must be supplemented with account-owned group participant metadata.");
assert(baileysProvider.includes('this.startSession(accountId, "RECONNECT", { syncContactHistory: true })'), "A missing persistent contact directory must use the isolated contact-history reconnect path.");
assert(baileysProvider.includes('"whatsapp.contacts.full_sync_started"'), "A manual refresh must run a full contact app-state sync even when fallback contacts already exist.");
assert(baileysProvider.includes("contactPhoneJidsByLid"), "Contact sync must retain LID-to-phone mappings across partial events.");
assert(baileysProvider.includes('socket.ev.on("chats.phoneNumberShare"'), "Phone-number share events must resolve modern LID contacts.");
assert(baileysProvider.includes("bootstrap_deferred_active_delivery"), "Contact bootstrap must not interrupt an active message delivery.");
assert(baileysProvider.includes("CONTACT_BOOTSTRAP_ACTIVE_DELIVERY_WINDOW_MS"), "Only recent active deliveries may defer contact bootstrap.");
assert(baileysProvider.includes("updatedAt: { gte:"), "Stale SENDING rows must not block contact bootstrap forever.");
assert(baileysProvider.includes("availabilityByJid.has(contact.externalContactId)"), "Partial availability responses must leave unreturned contacts unchanged.");
assert(!baileysProvider.includes("available.has(contact.externalContactId)"), "Partial availability responses must not deactivate every omitted contact.");

const baileysPatch = read("scripts/patch-baileys-contact-jid.mjs");
assert(baileysPatch.includes("LOGIVYA_CONTACT_PN_JID_COMPAT"), "The pinned Baileys 6.x build must retain modern contactAction PN JIDs.");
assert(baileysPatch.includes("LOGIVYA_HISTORY_LID_PN_COMPAT"), "History contacts must resolve official phone-number-to-LID mappings.");
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

const migration = read("prisma/migrations/20260711152000_team_seats_professional_contact_messaging/migration.sql");
assert(migration.includes("MessageRecipient_typed_target_check"), "Migration must enforce group/contact target integrity.");
assert(migration.includes('WHEN "slug" = \'starter\' THEN 2'), "Migration must assign two Starter seats.");
assert(migration.includes('WHEN "slug" = \'professional\' THEN 3'), "Migration must assign three Professional seats.");
assert(!/UPDATE\s+"Subscription"/i.test(migration), "Migration must not overwrite paid subscriptions.");
const hardeningMigration = read("prisma/migrations/20260711210000_enterprise_subscription_invitation_hardening/migration.sql");
assert(hardeningMigration.includes("CompanyInvitation_one_pending_email_per_company"), "Migration must prevent duplicate live pending invitations.");
assert(hardeningMigration.includes('"attemptCount"'), "Migration must persist per-target delivery attempt counts.");

for (const ui of ["src/components/campaign-composer-page.tsx", "apps/mobile/src/screens/app/messaging-screen.tsx"]) {
  const source = read(ui);
  assert(source.includes("Görünen kişileri seç"), `${ui} must support visible contact selection.`);
  assert(source.includes("Daha fazla kişi yükle"), `${ui} must support paginated contact loading.`);
  assert(source.includes("Profesyonel paketinde"), `${ui} must explain the locked Starter contact feature.`);
  assert(source.includes("attempt < 40"), `${ui} must poll the asynchronous contact bootstrap instead of assuming it finishes in 1.2 seconds.`);
}

console.log("Team seats, invitation lifecycle, contact privacy, typed delivery and cross-platform UI contracts passed.");
