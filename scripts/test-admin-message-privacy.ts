import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { redactSensitive } from "@logivya/logging";
import {
  ADMIN_MESSAGE_PRIVACY_FORBIDDEN_KEYS,
  serializeAdminAuditRecord,
  serializeAdminCampaignOperation,
} from "@/server/admin/message-privacy-contract";
import { logger, setLogSinkForTests } from "@/server/observability/logger";
import {
  MESSAGE_PRIVACY_RETENTION_POLICY,
  assertQueueRetentionMatchesPolicy,
} from "@/server/privacy/message-retention-policy";
import { DEFAULT_JOB_OPTIONS } from "@/server/queues/contracts";

const root = process.cwd();
const source = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");
const serializedKeys = (value: unknown) => {
  const keys = new Set<string>();
  const visit = (item: unknown) => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (!item || typeof item !== "object") return;
    for (const [key, nested] of Object.entries(item)) {
      keys.add(key);
      visit(nested);
    }
  };
  visit(value);
  return keys;
};

const canaries = {
  content: "CANARY_PRIVATE_MESSAGE_TEXT",
  phone: "+905551112233",
  jid: "905551112233@s.whatsapp.net",
  company: "CANARY_COMPANY",
  user: "canary-user@example.com",
};

const campaignSource = {
  id: "campaign-private-id",
  status: "FAILED",
  totalRecipients: 14,
  sentCount: 11,
  failedCount: 3,
  canceledCount: 0,
  createdAt: new Date("2026-07-23T14:35:48.000Z"),
  title: canaries.content,
  content: canaries.content,
  recipientPhone: canaries.phone,
  recipientJid: canaries.jid,
  companyName: canaries.company,
  userEmail: canaries.user,
  scheduledAt: new Date("2026-07-23T15:00:00.000Z"),
};
const campaignDto = serializeAdminCampaignOperation(
  campaignSource,
  "privacy-test-secret",
);
assert.deepEqual(Object.keys(campaignDto).sort(), [
  "canceled",
  "dateBucket",
  "errorCategory",
  "failed",
  "operationReference",
  "status",
  "succeeded",
  "total",
]);
assert.match(campaignDto.operationReference, /^op_[A-Za-z0-9_-]{16}$/);
assert.equal(campaignDto.dateBucket, "2026-07-23");
const campaignJson = JSON.stringify(campaignDto);
for (const value of Object.values(canaries))
  assert(!campaignJson.includes(value), `Admin campaign DTO leaked ${value}`);
const campaignKeys = serializedKeys(campaignDto);
for (const key of ADMIN_MESSAGE_PRIVACY_FORBIDDEN_KEYS)
  assert(!campaignKeys.has(key), `Forbidden admin DTO key: ${key}`);

const messageAudit = serializeAdminAuditRecord({
  id: "audit-1",
  action: "CAMPAIGN_COMPLETED",
  actorType: "SYSTEM",
  actorEmailMasked: null,
  result: "SUCCESS",
  entityType: "MessageCampaign",
  entityId: "campaign-private-id",
  clientPlatform: "worker",
  appVersion: "1.0.114",
  createdAt: new Date("2026-07-23T14:35:48.000Z"),
  company: { id: "company-private-id", name: canaries.company },
});
assert.equal(
  messageAudit,
  null,
  "Message operations must not enter admin audit responses",
);

const accountAudit = serializeAdminAuditRecord({
  id: "audit-2",
  action: "SUBSCRIPTION_ACTIVATED",
  actorType: "PLATFORM_ADMIN",
  actorEmailMasked: "a***@example.com",
  result: "SUCCESS",
  entityType: "Subscription",
  entityId: "subscription-1",
  clientPlatform: "web",
  appVersion: "1.0.114",
  createdAt: new Date("2026-07-23T14:35:48.000Z"),
  company: { id: "company-1", name: "Authorized billing company" },
});
assert(accountAudit);
assert(!("metadata" in accountAudit));
assert(!("beforeState" in accountAudit));
assert(!("afterState" in accountAudit));

const redacted = redactSensitive({
  content: canaries.content,
  message: canaries.content,
  phoneNumber: canaries.phone,
  recipientJid: canaries.jid,
  nested: { contactName: "Private Contact", targetJid: canaries.jid },
});
assert.equal(redacted.content, "[REDACTED]");
assert.equal(redacted.phoneNumber, "[REDACTED_PHONE]");
assert.equal(redacted.recipientJid, "[REDACTED]");

let captured: Record<string, unknown> | undefined;
setLogSinkForTests((event) => {
  captured = event;
});
try {
  logger.info("campaign.delivery.completed", {
    requestId: "request-safe-1234",
    correlationId: "correlation-safe-1234",
    companyId: "company-private-id",
    userId: "user-private-id",
    whatsappAccountId: "wa-private-id",
    campaignId: "campaign-private-id",
    recipientId: "recipient-private-id",
    content: canaries.content,
    detail: `${canaries.content} for ${canaries.phone} ${canaries.jid}`,
    statusCode: 200,
    result: "SUCCESS",
  });
} finally {
  setLogSinkForTests();
}
assert(captured, "Structured logger test sink did not receive an event");
const logJson = JSON.stringify(captured);
for (const value of [
  ...Object.values(canaries),
  "company-private-id",
  "user-private-id",
  "wa-private-id",
  "campaign-private-id",
  "recipient-private-id",
]) {
  assert(!logJson.includes(value), `Message-operation log leaked ${value}`);
}
assert(
  !("detail" in captured),
  "Non-allowlisted message-operation log field survived",
);
assert.equal(captured.companyId, "[REDACTED_RELATION]");

captured = undefined;
setLogSinkForTests((event) => {
  captured = event;
});
try {
  logger.error(
    "message.delivery.failed",
    new Error(
      `Failed to deliver ${canaries.content} to ${canaries.phone} (${canaries.jid})`,
    ),
    { requestId: "request-safe-5678", errorCode: "TEMPORARY_FAILURE" },
  );
} finally {
  setLogSinkForTests();
}
assert(captured, "Message-operation error test sink did not receive an event");
const errorLogJson = JSON.stringify(captured);
for (const value of Object.values(canaries)) {
  assert(
    !errorLogJson.includes(value),
    `Message-operation error log leaked ${value}`,
  );
}
assert.equal(
  (captured.error as { message?: string } | undefined)?.message,
  "[REDACTED]",
);
assert(
  !(captured.error as { stack?: string } | undefined)?.stack,
  "Message-operation error stack must not be retained",
);

captured = undefined;
setLogSinkForTests((event) => {
  captured = event;
});
try {
  logger.error(
    "worker.job.failed",
    new Error(`Queue failure included ${canaries.content}`),
    {
      queue: "message",
      jobName: "deliver-message",
      jobId: "job-safe-1234",
      detail: canaries.jid,
    },
  );
} finally {
  setLogSinkForTests();
}
assert(captured, "Message-queue error test sink did not receive an event");
assert(!JSON.stringify(captured).includes(canaries.content));
assert(!JSON.stringify(captured).includes(canaries.jid));
assert(
  !("detail" in captured),
  "Message-queue error retained non-allowlisted detail",
);

assert(
  assertQueueRetentionMatchesPolicy({
    completedAge: DEFAULT_JOB_OPTIONS.removeOnComplete.age,
    failedAge: DEFAULT_JOB_OPTIONS.removeOnFail.age,
  }),
);
assert.equal(
  MESSAGE_PRIVACY_RETENTION_POLICY.deadLetterQueue.contentAllowed,
  false,
);
assert.equal(
  MESSAGE_PRIVACY_RETENTION_POLICY.adminAnalytics.recipientLinkageAllowed,
  false,
);

const campaignPrivacySource = source("src/server/admin/message-privacy.ts");
assert.match(
  campaignPrivacySource,
  /select:\s*\{[\s\S]*?totalRecipients:\s*true/,
);
for (const forbiddenSelection of [
  "title: true",
  "content: true",
  "createdBy: true",
  "company: true",
  "recipients: true",
  "scheduledAt: true",
]) {
  assert(
    !campaignPrivacySource.includes(forbiddenSelection),
    `Admin campaign query selects ${forbiddenSelection}`,
  );
}

const adminSearchSource = source("src/app/api/admin/search/route.ts");
assert(!adminSearchSource.includes("messageCampaign"));
assert(!adminSearchSource.includes("campaigns:"));
const adminShellSource = source("src/components/admin-shell.tsx");
assert(!adminShellSource.includes("results.campaigns"));
const companyDetailSource = source("src/app/api/admin/companies/[id]/route.ts");
assert(!companyDetailSource.includes("campaigns:"));
assert(
  companyDetailSource.includes("phone: true"),
  "Authorized account administration phone field was removed",
);
assert(
  companyDetailSource.includes("phoneNumber: true"),
  "Authorized WhatsApp connection phone field was removed",
);
assert(
  !companyDetailSource.includes("messageCampaign"),
  "Account administration endpoint joined account phone data to messages",
);
const subscriptionUiSource = source(
  "src/components/admin-subscriptions-page.tsx",
);
assert(
  subscriptionUiSource.includes('value={company.phone || "-"}'),
  "Authorized subscription phone display was removed",
);
const adminCompaniesSource = source("src/app/api/admin/companies/route.ts");
assert(
  adminCompaniesSource.includes(
    'const canReadBilling = can("admin.billing.read")',
  ),
);
assert(
  adminCompaniesSource.includes("phone: company.phone"),
  "Billing-authorized company phone response was removed",
);
const connectedAccountUiSource = source(
  "src/components/accounts-stable-page.tsx",
);
assert(
  connectedAccountUiSource.includes("account.phoneNumber"),
  "Authorized WhatsApp account phone display was removed",
);
const adminCampaignUiSource = source(
  "src/app/(platform)/admin/campaigns/page.tsx",
);
assert(!adminCampaignUiSource.includes("phoneNumber"));
assert(!adminCampaignUiSource.includes("recipient"));

const activitySource = source("src/app/api/admin/activity/route.ts");
assert(activitySource.includes("adminAuditPrivacyWhere"));
for (const forbiddenSelection of [
  "beforeState: true",
  "afterState: true",
  "metadata: true",
  "correlationId: true",
]) {
  assert(
    !activitySource.includes(forbiddenSelection),
    `Admin activity selects ${forbiddenSelection}`,
  );
}
const securitySource = source("src/app/api/admin/security/events/route.ts");
assert(securitySource.includes("adminSecurityEventPrivacyWhere"));
for (const forbiddenSelection of [
  "message: true",
  "metadata: true",
  "correlationId: true",
]) {
  assert(
    !securitySource.includes(forbiddenSelection),
    `Admin security event selects ${forbiddenSelection}`,
  );
}
const securityDetailSource = source(
  "src/app/api/admin/security/events/[id]/route.ts",
);
assert(securityDetailSource.includes("adminSecurityEventPrivacyWhere({ id })"));
assert(
  !securityDetailSource.includes(
    "return NextResponse.json({ event: await prisma.securityEvent",
  ),
);

const dashboardSource = source("src/app/api/admin/dashboard/route.ts");
assert(dashboardSource.includes("adminSecurityEventPrivacyWhere"));
assert(!dashboardSource.includes("metadata: true"));
const dashboardSecuritySelection = dashboardSource.match(
  /prisma\.securityEvent\.findMany\(\{([\s\S]*?)\n\s*\}\)/,
)?.[1];
assert(
  dashboardSecuritySelection,
  "Dashboard security-event query was removed",
);
assert(
  !dashboardSecuritySelection.includes("message: true"),
  "Dashboard security-event feed selects sensitive event messages",
);
const incidentsSource = source("src/app/api/admin/incidents/route.ts");
assert(!incidentsSource.includes("description: true"));
assert(!incidentsSource.includes("metadata: true"));

const customerHistorySource = source("src/app/api/messages/campaigns/route.ts");
assert(customerHistorySource.includes("requireApiSession"));
assert(customerHistorySource.includes("companyId: company.id"));
assert(customerHistorySource.includes("createdById: user.id"));
assert(
  customerHistorySource.includes("content"),
  "Tenant customer history was accidentally removed",
);

const privacyExportSource = source("src/server/privacy/export.ts");
assert(privacyExportSource.includes("companyId"));
assert(privacyExportSource.includes("userId"));

process.stdout.write(
  "Admin message-content privacy, log minimization, tenant history and retention contract tests passed.\n",
);
