import { randomBytes } from "node:crypto";

import { prisma } from "../src/server/db";
import { subscriptionAccess } from "../src/server/billing/subscription-access";
import { deleteCompanyUser } from "../src/server/team/company-users";
import {
  acceptCompanyInvitation,
  createCompanyInvitation,
  getCompanySeatUsage,
} from "../src/server/team/company-invitations";
import { listOwnedWhatsAppContacts, persistWhatsAppContacts, resolveOwnedWhatsAppContacts } from "../src/server/whatsapp/contacts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertLocalTestDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (!localHost || !url.pathname.toLowerCase().includes("test")) {
    throw new Error("Refusing to run team/contact integration tests outside a local test database.");
  }
}

async function createUser(label: string) {
  const suffix = randomBytes(6).toString("hex");
  return prisma.user.create({
    data: {
      name: label,
      username: `${label.toLowerCase().replace(/\W/g, "-")}-${suffix}`,
      email: `${label.toLowerCase().replace(/\W/g, "-")}-${suffix}@example.test`,
      phone: `90${randomBytes(7).toString("hex").replace(/\D/g, "").padEnd(10, "7").slice(0, 10)}`,
      passwordHash: "integration-test-password-hash",
      locale: "tr",
    },
  });
}

async function createWorkspace(planSlug: "starter" | "professional", label: string) {
  const owner = await createUser(`${label}-owner`);
  const plan = await prisma.plan.findUniqueOrThrow({ where: { slug: planSlug } });
  const company = await prisma.company.create({ data: { name: label, ownerId: owner.id, email: owner.email } });
  const ownerMembership = await prisma.companyUser.create({ data: { companyId: company.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });
  const startsAt = new Date(Date.now() - 60_000);
  const endsAt = new Date(Date.now() + 30 * 86_400_000);
  await prisma.subscription.create({
    data: {
      companyId: company.id,
      planId: plan.id,
      status: "ACTIVE",
      billingPeriod: "MONTHLY",
      source: "MANUAL_ADMIN",
      startsAt,
      endsAt,
      currentPeriodStartsAt: startsAt,
      currentPeriodEndsAt: endsAt,
    },
  });
  return { owner, ownerMembership, company, plan };
}

function invitationToken(acceptUrl: string) {
  const token = new URL(acceptUrl).searchParams.get("invitation");
  assert(token, "Invitation response must include the one-time raw token in its accept URL.");
  return token;
}

async function expectError(action: () => Promise<unknown>, expectedMessage: string) {
  try {
    await action();
  } catch (error) {
    assert(error instanceof Error && error.message === expectedMessage, `Expected ${expectedMessage}, received ${error instanceof Error ? error.message : String(error)}.`);
    return;
  }
  throw new Error(`Expected ${expectedMessage}, but the operation succeeded.`);
}

async function main() {
  assertLocalTestDatabase();
  const request = new Request("http://localhost:3000/api/company/invitations", {
    method: "POST",
    headers: { "x-logivya-locale": "tr" },
  });

  const starter = await createWorkspace("starter", `Starter Integration ${Date.now()}`);
  const starterInvitee = await createUser("starter-member");
  const starterInvitation = await createCompanyInvitation(request, {
    companyId: starter.company.id,
    actorUserId: starter.owner.id,
    actorRole: starter.ownerMembership.role,
  }, { name: starterInvitee.name, email: starterInvitee.email, role: "OPERATOR" });
  let seats = await getCompanySeatUsage(starter.company.id);
  assert(seats.limit === 2 && seats.used === 2 && seats.pendingInvitations === 1, "Starter pending invitation must reserve the second seat.");
  await expectError(() => createCompanyInvitation(request, {
    companyId: starter.company.id,
    actorUserId: starter.owner.id,
    actorRole: starter.ownerMembership.role,
  }, { name: "Blocked member", email: "blocked-starter@example.test", role: "OPERATOR" }), "SEAT_LIMIT_REACHED");
  await expectError(() => createCompanyInvitation(request, {
    companyId: starter.company.id,
    actorUserId: starterInvitee.id,
    actorRole: "OPERATOR",
  }, { name: "Unauthorized member", email: "unauthorized@example.test", role: "VIEWER" }), "FORBIDDEN");

  const starterAccepted = await acceptCompanyInvitation({
    code: starterInvitation.inviteCode,
    userId: starterInvitee.id,
    email: starterInvitee.email,
  });
  assert(starterAccepted.membership.status === "ACTIVE" && starterAccepted.companyId === starter.company.id, "Starter invitee must join the owner's company.");
  await expectError(() => acceptCompanyInvitation({
    token: invitationToken(starterInvitation.acceptUrl),
    userId: starterInvitee.id,
    email: starterInvitee.email,
  }), "INVITATION_ALREADY_USED");
  seats = await getCompanySeatUsage(starter.company.id);
  assert(seats.activeMembers === 2 && seats.pendingInvitations === 0 && seats.used === 2, "Accepted invitation must exchange the reserved seat for an active membership.");
  assert((await subscriptionAccess.getCurrent(starter.company.id))?.plan.slug === "starter", "Invited member's company must resolve the one authoritative Starter subscription.");
  assert((await subscriptionAccess.canSendTargets(starter.company.id, { groupCount: 1, contactCount: 0 })).allowed, "Starter company must retain group messaging.");
  const starterContactAccess = await subscriptionAccess.canSendTargets(starter.company.id, { groupCount: 0, contactCount: 1 });
  assert(!starterContactAccess.allowed && starterContactAccess.reason === "entitlement.contactMessaging", "Starter contact messaging must be rejected by the backend entitlement service.");

  const memberSession = await prisma.userSession.create({
    data: {
      userId: starterInvitee.id,
      companyId: starter.company.id,
      sessionTokenHash: randomBytes(32).toString("hex"),
      ipAddress: "127.0.0.1",
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  await deleteCompanyUser(request, {
    companyId: starter.company.id,
    actorUserId: starter.owner.id,
    actorRole: "OWNER",
  }, starterAccepted.membership.id);
  assert(!(await prisma.companyUser.findUnique({ where: { id: starterAccepted.membership.id } })), "Removed member must lose the company membership.");
  assert((await prisma.userSession.findUniqueOrThrow({ where: { id: memberSession.id } })).revokedAt, "Removed member's company session must be revoked.");

  const professional = await createWorkspace("professional", `Professional Integration ${Date.now()}`);
  const professionalMember = await createUser("professional-member");
  const secondProfessionalMember = await createUser("professional-member-two");
  const firstProfessionalInvitation = await createCompanyInvitation(request, {
    companyId: professional.company.id,
    actorUserId: professional.owner.id,
    actorRole: "OWNER",
  }, { name: professionalMember.name, email: professionalMember.email, role: "OPERATOR" });
  await createCompanyInvitation(request, {
    companyId: professional.company.id,
    actorUserId: professional.owner.id,
    actorRole: "OWNER",
  }, { name: secondProfessionalMember.name, email: secondProfessionalMember.email, role: "VIEWER" });
  seats = await getCompanySeatUsage(professional.company.id);
  assert(seats.limit === 3 && seats.used === 3 && seats.pendingInvitations === 2, "Professional must reserve exactly two invited seats.");
  await expectError(() => createCompanyInvitation(request, {
    companyId: professional.company.id,
    actorUserId: professional.owner.id,
    actorRole: "OWNER",
  }, { name: "Fourth company user", email: "blocked-professional@example.test", role: "OPERATOR" }), "SEAT_LIMIT_REACHED");
  const professionalAccepted = await acceptCompanyInvitation({
    token: invitationToken(firstProfessionalInvitation.acceptUrl),
    userId: professionalMember.id,
    email: professionalMember.email,
  });
  assert(professionalAccepted.membership.status === "ACTIVE", "Professional invitee must become active.");
  assert((await subscriptionAccess.canSendTargets(professional.company.id, { groupCount: 1, contactCount: 2 })).allowed, "Professional must allow mixed group and contact targets.");

  const ownerAccount = await prisma.whatsAppAccount.create({
    data: { companyId: professional.company.id, userId: professional.owner.id, provider: "BAILEYS", status: "CONNECTED", phoneNumber: "+905551110001" },
  });
  const memberAccount = await prisma.whatsAppAccount.create({
    data: { companyId: professional.company.id, userId: professionalMember.id, provider: "BAILEYS", status: "CONNECTED", phoneNumber: "+905551110002" },
  });
  await persistWhatsAppContacts(ownerAccount.id, [
    { id: "905550000001@s.whatsapp.net", notify: "Owner Contact" },
    { id: "120363000000@g.us", name: "Must Be Ignored" },
  ], { source: "INTEGRATION_TEST" });
  await persistWhatsAppContacts(memberAccount.id, [
    { id: "905550000002@s.whatsapp.net", notify: "Member Contact" },
  ], { source: "INTEGRATION_TEST" });
  const ownerContacts = await listOwnedWhatsAppContacts({ companyId: professional.company.id, userId: professional.owner.id, accountId: ownerAccount.id, page: 1, limit: 10 });
  const memberContacts = await listOwnedWhatsAppContacts({ companyId: professional.company.id, userId: professionalMember.id, accountId: memberAccount.id, page: 1, limit: 10 });
  assert(ownerContacts.contacts.length === 1 && ownerContacts.contacts[0]?.phone === "905550000001", "Owner must see only the owner's account contacts.");
  assert(memberContacts.contacts.length === 1 && memberContacts.contacts[0]?.phone === "905550000002", "Invited member must see only the member's account contacts.");
  await expectError(() => resolveOwnedWhatsAppContacts({ companyId: professional.company.id, userId: professional.owner.id, accountId: ownerAccount.id }, [memberContacts.contacts[0]!.id]), "WHATSAPP_CONTACT_OWNERSHIP_MISMATCH");

  const ownerGroup = await prisma.whatsAppGroup.create({
    data: {
      companyId: professional.company.id,
      userId: professional.owner.id,
      accountId: ownerAccount.id,
      externalGroupId: "120363999999@g.us",
      name: "Integration Group",
      lastSyncedAt: new Date(),
    },
  });
  const campaign = await prisma.messageCampaign.create({
    data: {
      companyId: professional.company.id,
      createdById: professional.owner.id,
      title: "Typed integration",
      content: "Test",
      type: "WHATSAPP_MIXED",
      status: "QUEUED",
      totalRecipients: 2,
      recipients: {
        create: [
          { accountId: ownerAccount.id, groupId: ownerGroup.id, targetType: "GROUP", recipientName: ownerGroup.name, recipientExternalId: ownerGroup.externalGroupId },
          { accountId: ownerAccount.id, contactId: ownerContacts.contacts[0]!.id, targetType: "CONTACT", recipientName: "Owner Contact", recipientExternalId: ownerContacts.contacts[0]!.externalContactId },
        ],
      },
    },
    include: { recipients: true },
  });
  assert(campaign.recipients.filter((recipient) => recipient.targetType === "GROUP").length === 1, "Mixed campaign must persist one GROUP recipient.");
  assert(campaign.recipients.filter((recipient) => recipient.targetType === "CONTACT").length === 1, "Mixed campaign must persist one CONTACT recipient.");
  let databaseConstraintRejected = false;
  try {
    await prisma.messageRecipient.create({
      data: {
        campaignId: campaign.id,
        accountId: ownerAccount.id,
        groupId: ownerGroup.id,
        contactId: ownerContacts.contacts[0]!.id,
        targetType: "GROUP",
        recipientName: "Invalid typed target",
        recipientExternalId: ownerGroup.externalGroupId,
      },
    });
  } catch {
    databaseConstraintRejected = true;
  }
  assert(databaseConstraintRejected, "Database constraint must reject recipients with both groupId and contactId.");

  console.log("Local PostgreSQL integration passed: seats, invites, inheritance, removal, contact isolation and typed-target integrity.");
}

main().finally(() => prisma.$disconnect());
