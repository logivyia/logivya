import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { CORE_PLAN_MATRIX } from "../src/server/billing/plan-matrix";
import { evaluateMessageTargetAccess } from "../src/server/billing/message-target-access";
import { buildMessageRecipientRows } from "../src/server/messages/recipient-targets";

const root = process.cwd();

for (const planCode of ["starter", "professional"] as const) {
  const rule = CORE_PLAN_MATRIX[planCode];
  const entitlements = {
    active: true,
    groupMessaging: rule.groupMessaging,
    contactMessaging: rule.contactMessaging,
  };

  assert.equal(
    evaluateMessageTargetAccess(entitlements, { groupCount: 0, contactCount: 3 }).allowed,
    true,
    `${planCode} must allow contact-only messaging.`,
  );
  assert.equal(
    evaluateMessageTargetAccess(entitlements, { groupCount: 2, contactCount: 0 }).allowed,
    true,
    `${planCode} must allow group-only messaging.`,
  );
  assert.equal(
    evaluateMessageTargetAccess(entitlements, { groupCount: 2, contactCount: 3 }).allowed,
    true,
    `${planCode} must allow mixed contact and group messaging.`,
  );
}

assert.equal(CORE_PLAN_MATRIX.trial.contactMessaging, true, "Trial contact messaging must remain unchanged.");
assert.equal(CORE_PLAN_MATRIX.professional.contactMessaging, true, "Professional contact messaging must remain unchanged.");
assert.equal(
  evaluateMessageTargetAccess(
    { active: false, groupMessaging: true, contactMessaging: true },
    { groupCount: 2, contactCount: 3 },
  ).reason,
  "subscription.inactive",
  "Inactive subscriptions must remain blocked.",
);

const recipientRows = buildMessageRecipientRows(
  [
    { accountId: "account-1", id: "group-1", name: "Group 1", externalGroupId: "group-1@g.us" },
    { accountId: "account-1", id: "group-2", name: "Group 2", externalGroupId: "group-2@g.us" },
  ],
  [
    { accountId: "account-1", id: "contact-1", name: "Contact 1", pushName: null, phone: "+900000000001", externalContactId: "contact-1@s.whatsapp.net" },
    { accountId: "account-1", id: "contact-2", name: null, pushName: "Contact 2", phone: "+900000000002", externalContactId: "contact-2@s.whatsapp.net" },
    { accountId: "account-1", id: "contact-3", name: null, pushName: null, phone: "+900000000003", externalContactId: "contact-3@s.whatsapp.net" },
  ],
);

assert.equal(recipientRows.length, 5, "Mixed recipient building must retain every contact and group.");
assert.equal(recipientRows.filter((recipient) => recipient.targetType === "GROUP").length, 2);
assert.equal(recipientRows.filter((recipient) => recipient.targetType === "CONTACT").length, 3);
assert.equal(new Set(recipientRows.map((recipient) => recipient.recipientExternalId)).size, 5);

const sourceContracts = [
  {
    file: "src/components/campaign-composer-page.tsx",
    required: ["groupIds:", "contactIds:"],
  },
  {
    file: "apps/mobile/src/screens/app/messaging-screen.tsx",
    required: ["groupIds:", "contactIds:"],
  },
  {
    file: "src/server/messages/delivery-pipeline.ts",
    required: ["buildMessageRecipientRows(groups, contacts)", "groupCount: groups.length", "contactCount: contacts.length"],
  },
  {
    file: "src/worker/index.ts",
    required: ["entitlements.contactMessaging", 'targetType === "CONTACT"', 'targetType === "GROUP"'],
  },
];

for (const contract of sourceContracts) {
  const source = fs.readFileSync(path.join(root, contract.file), "utf8");
  for (const token of contract.required) {
    assert.ok(source.includes(token), `${contract.file} must preserve ${token}.`);
  }
}

console.log("Starter and Professional contact/group/mixed messaging regression tests passed.");
