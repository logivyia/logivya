import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const bootstrapRoute = readFileSync(path.join(root, "src/app/api/mobile/bootstrap/route.ts"), "utf8");

assert(
  bootstrapRoute.includes("dashboardMetrics: {"),
  "The mobile bootstrap response must expose dashboardMetrics for current Android and iOS clients."
);

for (const metric of [
  "whatsappAccountCount",
  "connectedWhatsAppAccountCount",
  "syncedWhatsAppGroupCount",
  "contactCount",
  "showContacts",
]) {
  assert(
    bootstrapRoute.includes(metric),
    `The mobile bootstrap dashboard contract must include ${metric}.`
  );
}

assert(
  bootstrapRoute.includes("whatsapp: {") && bootstrapRoute.includes("connectedCount: connectedWhatsAppAccountCount"),
  "The legacy whatsapp dashboard contract must remain available for older clients."
);
assert(
  bootstrapRoute.includes("companyId: company.id") && bootstrapRoute.includes("userId: user.id"),
  "Dashboard metrics must remain scoped to the authenticated company and user."
);
assert(
  bootstrapRoute.includes("prisma.whatsAppAccount.count") &&
    bootstrapRoute.includes("prisma.whatsAppGroup.count") &&
    bootstrapRoute.includes("prisma.contact.count"),
  "Dashboard metrics must be computed from backend-owned account, group, and contact records."
);
assert(
  bootstrapRoute.includes("subscriptionStatus.entitlements.contactMessaging"),
  "Contact visibility must use the canonical backend entitlement result."
);

console.log("Mobile dashboard bootstrap contract passed.");
