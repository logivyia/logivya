import { readFileSync } from "node:fs";

function read(path: string) {
  return readFileSync(path, "utf8");
}

function assertIncludes(source: string, expected: string, message: string) {
  if (!source.includes(expected)) throw new Error(message);
}

const shell = read("src/components/admin-shell.tsx");
const companies = read("src/components/admin-companies-page.tsx");
const users = read("src/components/admin-users-page.tsx");
const subscriptions = read("src/components/admin-subscriptions-page.tsx");
const support = read("src/components/admin-support-page.tsx");
const privacy = read("src/components/admin-privacy-center.tsx");
const notifications = read("src/components/admin-notification-operations.tsx");
const observability = read("src/components/admin-observability-centers.tsx");
const whatsapp = read("src/components/admin-whatsapp-ingestion.tsx");
const trialRisk = read("src/components/admin-trial-risk-page.tsx");

assertIncludes(
  shell,
  'aria-label={t("admin.searchPlaceholder")}',
  "Global administrator search must have a persistent accessible name",
);
assertIncludes(
  shell,
  'className="min-w-0 max-w-full overflow-x-clip"',
  "Administrator shell must contain page-level horizontal overflow",
);
assertIncludes(
  shell,
  'root.classList.add("overflow-x-clip")',
  "Administrator routes must prevent root-level horizontal scrolling",
);
assertIncludes(
  companies,
  'aria-label={locale === "tr" ? "Durum filtresi" : "Status filter"}',
  "Company status filter must be labelled",
);
assertIncludes(
  users,
  'aria-label={locale === "tr" ? "Durum filtresi" : "Status filter"}',
  "User status filter must be labelled",
);
assertIncludes(
  subscriptions,
  'aria-label={t("adminSubscriptions.searchPlaceholder")}',
  "Subscription search must be labelled",
);
assertIncludes(
  subscriptions,
  'aria-label={t("adminSubscriptions.manualActivate")}',
  "Subscription activation must keep its name while loading",
);
assertIncludes(
  subscriptions,
  'aria-label={t("common.close")}',
  "Subscription dialogs must expose a close action name",
);

for (const label of [
  'aria-label={t("adminSupport.searchPlaceholder")}',
  'aria-label={t("adminSupport.ticketStatus")}',
  'aria-label={t("support.priority")}',
  'aria-label={t("adminSupport.writeReply")}',
]) {
  assertIncludes(support, label, `Support control is missing ${label}`);
}

for (const label of [
  "aria-label={text.status}",
  "aria-label={text.response}",
  "aria-label={text.summary}",
  "aria-label={text.password}",
  "aria-label={text.reason}",
  "aria-label={deletionText.operation}",
  "aria-label={deletionText.evidence}",
  "aria-label={deletionText.confirmation}",
]) {
  assertIncludes(privacy, label, `Privacy control is missing ${label}`);
}

for (const label of [
  "aria-label={copy.event}",
  "aria-label={copy.channel}",
  "aria-label={copy.locale}",
  "aria-label={copy.templateName}",
  "aria-label={copy.title}",
  "aria-label={copy.emailSubject}",
  "aria-label={copy.templateBody}",
  "aria-label={copy.requiredVariables}",
]) {
  assertIncludes(
    notifications,
    label,
    `Notification template control is missing ${label}`,
  );
}

assertIncludes(
  observability,
  "aria-label={labels.reset}",
  "Audit reset button must have an accessible name",
);

for (const label of [
  "aria-label={copy.searchPlaceholder}",
  '"Görünen tüm grupları seç"',
  '"Grubu seç"',
  "aria-label={`${copy.minimumConfidence}: ${group.name}`}",
  "aria-label={`${copy.sectorHint}: ${group.name}`}",
]) {
  assertIncludes(
    whatsapp,
    label,
    `WhatsApp ingestion control is missing ${label}`,
  );
}

for (const [source, page] of [
  [notifications, "notifications"],
  [trialRisk, "trial risk"],
] as const) {
  assertIncludes(
    source,
    "min-w-0 max-w-full overflow-hidden",
    `${page} wide table must be contained at mobile widths`,
  );
  assertIncludes(
    source,
    "w-full max-w-full overflow-x-auto",
    `${page} wide table must scroll inside its own container`,
  );
}

console.log("Admin accessibility and responsive contracts passed.");
