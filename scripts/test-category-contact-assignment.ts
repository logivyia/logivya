import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(file: string) {
  return readFileSync(path.join(root, file), "utf8");
}

for (const route of [
  "src/app/api/categories/[id]/contacts/route.ts",
  "src/app/api/mobile/categories/[id]/contacts/route.ts",
]) {
  assert(existsSync(path.join(root, route)), `Required category contact route is missing: ${route}`);
}

const schema = read("prisma/schema.prisma");
assert(schema.includes("model CategoryContact"), "Category contacts must be persisted in a dedicated join model.");
for (const field of ["categoryId String", "contactId  String", "userId     String", "companyId  String", "accountId  String"]) {
  assert(schema.includes(field), `CategoryContact must include scoped field: ${field}`);
}
assert(schema.includes("@@unique([categoryId, contactId])"), "Duplicate category/contact assignments must be prevented.");
assert(schema.includes("contacts    CategoryContact[]"), "Category must expose persisted contact assignments.");
assert(schema.includes("groups      CategoryGroup[]"), "Stable CategoryGroup architecture must remain intact.");

const migration = read("prisma/migrations/20260712130000_contact_category_assignment/migration.sql");
assert(migration.includes('CREATE TABLE IF NOT EXISTS "CategoryContact"'), "Migration must safely create the new join table.");
assert(migration.includes("ON DELETE CASCADE"), "Category assignment rows must clean up without deleting category targets.");
assert(!/DROP\s+TABLE\s+"CategoryGroup"/i.test(migration), "Migration must never drop stable group assignments.");
assert(!/DELETE\s+FROM\s+"CategoryGroup"/i.test(migration), "Migration must preserve every existing group assignment.");

const service = read("src/server/categories/category-targets.ts");
assert(service.includes("MAX_CONTACT_ASSIGNMENTS = 50_000"), "Contact assignment payloads must have an enterprise-safe hard bound.");
assert(service.includes("CONTACT_MESSAGING_REQUIRES_PROFESSIONAL"), "Starter direct API attempts must receive the Professional entitlement error.");
assert(service.includes("companyId: scope.companyId"), "Category contacts must be company scoped.");
assert(service.includes("userId: scope.userId"), "Category contacts must be user scoped.");
assert(service.includes("accountId: account.id"), "Category contacts must be WhatsApp-account scoped.");
assert(service.includes("prisma.$transaction"), "Group, contact and metadata changes must save atomically.");
assert(service.includes("CATEGORY_CONTACT_ASSIGNMENT_SAVED"), "Assignment saves must emit structured observability.");
assert(service.includes("CATEGORY_TARGET_SKIPPED_STALE"), "Stale category targets must be skipped observably.");
assert(service.includes("Math.min(100"), "Contact assignment pages must have a hard server-side page limit.");

const pipeline = read("src/server/messages/delivery-pipeline.ts");
assert(pipeline.includes("resolveCategoryContactsForSend"), "Message delivery must resolve contact targets from selected categories.");
assert(pipeline.includes("contactsByIdentity.set(`${contact.accountId}:${contact.externalContactId}`"), "Direct and category contacts must deduplicate by account-scoped stable identity.");
assert(pipeline.includes("categoryContactResolution.skippedStaleCount"), "Message metadata must retain stale-target warning counts.");
assert(pipeline.includes("resolveSendableWhatsAppGroups"), "Stable group delivery resolution must remain intact.");

for (const route of ["src/app/api/categories/route.ts", "src/app/api/mobile/categories/route.ts"]) {
  const source = read(route);
  assert(source.includes("assignedContactCount"), `${route} must return category contact counts.`);
  assert(source.includes("totalTargetCount"), `${route} must return total target counts.`);
}

const localizedAssignmentUiContracts = [
  {
    file: "src/components/categories-management-page.tsx",
    assigned: 't("categories.assignedContacts")',
    assignable: 't("categories.assignableContacts")',
    selectVisible: 't("composer.selectVisibleContacts")',
    loadMore: 't("composer.loadMoreContacts")',
    professionalLock: 't("categories.contactAssignmentProfessional")',
  },
  {
    file: "apps/mobile/src/screens/app/category-detail-screen.tsx",
    assigned: 't("assignedContacts")',
    assignable: 't("assignableContacts")',
    selectVisible: 't("selectVisibleContacts")',
    loadMore: 't("loadMoreContacts")',
    professionalLock: 't("contactCategoryProfessionalRequired")',
  },
];

for (const ui of localizedAssignmentUiContracts) {
  const source = read(ui.file);
  assert(source.includes(ui.assigned), `${ui.file} must show assigned contacts through localization.`);
  assert(source.includes(ui.assignable), `${ui.file} must show assignable contacts through localization.`);
  assert(source.includes(ui.selectVisible), `${ui.file} must support localized visible-page selection.`);
  assert(source.includes(ui.loadMore), `${ui.file} must support localized incremental contact loading.`);
  assert(source.includes(ui.professionalLock), `${ui.file} must explain the Starter entitlement lock through localization.`);
}

const localizedEmptyAudienceContracts = [
  ["src/components/categories-management-page.tsx", 't("categories.noAudienceAssigned")'],
  ["src/components/campaign-composer-page.tsx", 't("composer.noTargetSelected")'],
  ["apps/mobile/src/screens/app/categories-screen.tsx", 't("noAssignedAudience")'],
  ["apps/mobile/src/screens/app/messaging-screen.tsx", 't("noTargetSelected")'],
] as const;

for (const [file, emptyAudienceKey] of localizedEmptyAudienceContracts) {
  const source = read(file);
  assert(source.includes(emptyAudienceKey), `${file} must represent an empty audience through localization.`);
  assert(source.includes("contacts"), `${file} must include contact counts in category summaries.`);
}

console.log("Category contact persistence, ownership, entitlement, pagination, UI and mixed-audience delivery contracts passed.");
