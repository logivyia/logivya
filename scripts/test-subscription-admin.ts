import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const checks: Array<[string, string, string[]]> = [
  ["schema", "prisma/schema.prisma", ["SUSPENDED", "MANUALLY_CONFIRMED", "FREE_PROMO"]],
  ["manual activation", "src/server/billing/manual-activation.ts", ["activateCompanySubscription", 'source: "MANUAL_ADMIN"', 'provider: "MANUAL"']],
  ["subscription activation", "src/server/billing/subscription-activation.ts", ["MANUALLY_CONFIRMED", "SUBSCRIPTION_MANUALLY_ACTIVATED", "PLAN_ASSIGNED_BY_ADMIN"]],
  ["subscription actions", "src/app/api/admin/subscriptions/[id]/action/route.ts", ["requirePlatformAdmin", "writeAuditLog", "SUSPEND", "CHANGE_PLAN"]],
  ["admin UI", "src/components/admin-subscriptions-page.tsx", ["adminSubscriptions.manual", "FREE_PROMO", "CHANGE_PLAN"]],
  ["expiry", "src/app/api/cron/subscriptions/expire/route.ts", ["endsAt", "EXPIRED"]],
  ["dashboard metrics", "src/app/api/admin/dashboard/route.ts", ["pendingSubscriptionRequests", "expiringInSevenDays", "monthlyConfirmedPaymentTotal"]],
  ["metadata", "src/app/layout.tsx", ["/favicon.ico?v=3", "applicationName: \"Logivya\""]],
  ["brand logo", "src/components/brand-logo.tsx", ["/logivya/logo-transparent-v5.png"]],
];

async function main() {
  for (const [label, file, expected] of checks) {
    const content = await readFile(path.join(root, file), "utf8");
    for (const value of expected) {
      if (!content.includes(value)) throw new Error(`${label}: missing ${value}`);
    }
  }

  for (const file of [
    "public/favicon.ico",
    "public/favicon-16x16.png",
    "public/favicon-32x32.png",
    "public/apple-touch-icon.png",
    "public/android-chrome-192x192.png",
    "public/android-chrome-512x512.png",
    "public/logivya/logo.jpeg",
    "public/logivya/logo-v3.jpeg",
    "public/logivya/logo-transparent-v5.png",
    "public/faciocoin/faciocoin-feather-4k.png",
    "public/faciocoin/faciocoin-feather.svg",
  ]) {
    await access(path.join(root, file));
  }

  console.log("Subscription admin, branding, favicon and Faciocoin checks passed.");
}

void main();
