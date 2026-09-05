import { readFileSync } from "node:fs";

process.env.SUPER_ADMIN_EMAIL ||= "platform-owner@example.com";

function read(path: string) {
  return readFileSync(path, "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function section(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(startIndex >= 0 && endIndex > startIndex, `Missing source section: ${start}`);
  return source.slice(startIndex, endIndex);
}

function requestGenerationGuardCount(source: string) {
  const increments = source.match(/\+\+\w+\.current/gu) ?? [];
  const currentChecks = source.match(/\w+\s*!==\s*\w+\.current/gu) ?? [];
  return Math.min(increments.length, currentChecks.length);
}

const mobileApi = read("apps/mobile/src/api/mobileAdmin.ts");
const mobileScreen = read(
  "apps/mobile/src/screens/app/platform-module-screen.tsx",
);
const mobileNotificationScreen = read(
  "apps/mobile/src/screens/app/admin-notification-operations-screen.tsx",
);
const moreScreen = read("apps/mobile/src/screens/app/more-screen.tsx");
const marketplaceBottomTabBar = read(
  "apps/mobile/src/components/marketplace-bottom-tab-bar.tsx",
);
const webParityTabBar = read(
  "apps/mobile/src/components/web-parity-tab-bar.tsx",
);
const authStore = read("apps/mobile/src/auth/auth-store.ts");
const sessionCleanup = read("apps/mobile/src/auth/session-cleanup.ts");
const ownerGuard = read("src/server/auth/platform-owner.ts");
const platformGuard = read("src/server/auth/platform-admin.ts");
const snapshotService = read("src/server/admin/module-snapshots.ts");
const snapshotRoute = read("src/app/api/admin/modules/[module]/route.ts");
const supportService = read("src/server/support/service.ts");
const subscriptionRoute = read("src/app/api/admin/subscriptions/route.ts");
const trialEntitlementRoute = read(
  "src/app/api/admin/trial-entitlements/route.ts",
);
const securityEventsRoute = read(
  "src/app/api/admin/security/events/route.ts",
);
const platformLoadSection = section(
  mobileScreen,
  "const load = useCallback(",
  "const applySupportSearch = useCallback(",
);
const notificationLoadMoreSection = section(
  mobileNotificationScreen,
  "const loadMore = useCallback(",
  "const handleMutationError =",
);

const requiredModules = [
  "dashboard",
  "companies",
  "users",
  "billing",
  "subscriptions",
  "invoices",
  "payments",
  "whatsappAccounts",
  "campaigns",
  "support",
  "security",
  "trialRisk",
  "compliance",
  "audit",
  "activity",
  "notifications",
  "dataRequests",
  "metrics",
  "systemHealth",
  "backups",
  "disasterRecovery",
  "settings",
  "featureFlags",
  "announcements",
  "apiUsage",
  "webhooks",
  "platformSettings",
];

for (const moduleName of requiredModules) {
  assert(
    mobileApi.includes(`${moduleName}: {`),
    `Missing mobile admin module definition: ${moduleName}`,
  );
  assert(
    moreScreen.includes(`key: "${moduleName}"`),
    `Missing mobile administrator navigation entry: ${moduleName}`,
  );
}

for (const moduleName of [
  "billing",
  "whatsapp-accounts",
  "campaigns",
  "compliance",
  "audit",
  "notifications",
  "data-requests",
  "backups",
  "disaster-recovery",
  "settings",
  "feature-flags",
  "announcements",
  "api-usage",
  "webhooks",
  "platform-settings",
]) {
  assert(
    snapshotService.includes(`"${moduleName}"`),
    `Missing protected snapshot implementation: ${moduleName}`,
  );
}

assert(
  snapshotRoute.includes("requirePlatformAdmin"),
  "Administrator module snapshots must use the centralized backend guard",
);
assert(
  snapshotRoute.includes('"Cache-Control": "private, no-store"'),
  "Administrator responses must not be stored in a shared cache",
);
assert(
  ownerGuard.includes("process.env.SUPER_ADMIN_EMAIL"),
  "Platform owner authorization must be controlled by SUPER_ADMIN_EMAIL",
);
assert(
  !ownerGuard.includes('LOGIVYA_PLATFORM_OWNER_EMAIL = "'),
  "Platform owner email must not be hardcoded in authorization logic",
);
assert(
  ownerGuard.includes("trim().toLowerCase()"),
  "Platform owner email must be normalized server-side",
);
assert(
  platformGuard.includes("isAuthorizedLogivyaPlatformAdmin") &&
    platformGuard.includes("context.user.email"),
  "Platform guard must authorize from the authenticated backend user",
);
assert(
  moreScreen.includes("canSeeAdminHub") &&
    moreScreen.includes("adminPermissions"),
  "Mobile administrator visibility must use backend-issued permissions",
);
assert(
  moreScreen.includes("width < 600 ? styles.adminGridItemSingleColumn"),
  "Administrator navigation cards must use a single column on phones and compact tablets",
);
assert(
  !webParityTabBar.includes("DRAWER_SCROLL_FULL_FIX_V1"),
  "Internal drawer build markers must never enter the accessibility tree",
);
assert(
  marketplaceBottomTabBar.includes(
    "backgroundColor: center ? theme.primary : active ? theme.badge : \"transparent\"",
  ) && marketplaceBottomTabBar.includes(
    "accessibilityState={{ selected: active }}",
  ),
  "The center marketplace shortcut must stay orange while selected state reflects only the actual route",
);
assert(
  mobileApi.includes("maskEmailForSummary(") &&
    mobileScreen.includes("maskEmailForSummary(ticket.createdBy?.email)"),
  "Administrator list summaries must mask email addresses while preserving authorized detail fields",
);
assert(
  authStore.includes("isPlatformAdmin: false"),
  "Logout/session reset must clear the administrator flag",
);
assert(
  sessionCleanup.includes("queryClient.clear()"),
  "Logout must clear cached administrator data",
);
assert(
  sessionCleanup.includes("clearTokens"),
  "Logout must clear secure tokens",
);

assert(
  !mobileScreen.includes("definition.endpoint ? definition.endpoint"),
  "The mobile UI must never display API endpoint paths",
);
assert(
  mobileScreen.includes("AdminModuleDetail"),
  "Mobile admin records must have a functional detail view",
);
assert(
  mobileScreen.includes("runModuleAction"),
  "Supported administrator actions are not wired to the mobile UI",
);
assert(
  mobileScreen.includes("reauthenticatePlatformAdmin"),
  "Critical mobile administrator actions require backend reauthentication",
);
assert(
  mobileScreen.includes("ManualSubscriptionPanel"),
  "Desktop manual subscription management is missing from the mobile administrator UI",
);
assert(
  mobileScreen.includes("activateAdminSubscriptionManually"),
  "Manual subscription activation is not connected to the protected backend endpoint",
);
assert(
  mobileScreen.includes("manualSubscriptionReviewOpen") &&
    mobileScreen.includes("manualSubscriptionConfirmationPhrase") &&
    mobileScreen.includes('t("notifications.admin.preview")') &&
    mobileScreen.includes("adminPaymentMethodLabel(value.paymentMethod, locale)"),
  "Manual subscription activation must show a target, plan, date, payment and reason review before mutation",
);
assert(
  mobileScreen.includes(
    "manualSubscriptionConfirmation.trim() !==",
  ) && mobileScreen.includes('t("adminSubscriptions.actionWarning")'),
  "Manual subscription activation must enforce review and typed confirmation in the mutation handler",
);
assert(
  !mobileNotificationScreen.includes(
    "Canceled by authorized mobile administrator",
  ) &&
    mobileNotificationScreen.includes("cancelReason.trim().length < 5") &&
    mobileNotificationScreen.includes("`CANCEL ${cancelTarget.id}`"),
  "Announcement cancellation must use a real typed reason and target-bound confirmation",
);
assert(
  mobileNotificationScreen.includes("copy.cancelTarget") &&
    mobileNotificationScreen.includes("props.cancelTarget.channels") &&
    mobileNotificationScreen.includes(
      "adminChannelLabel(channel, props.locale)",
    ),
  "Announcement cancellation must display the selected target and delivery channels before mutation",
);
assert(
  mobileScreen.includes("RefreshControl"),
  "Mobile administrator modules require pull-to-refresh",
);
assert(
  mobileScreen.includes("moduleStatus"),
  "Mobile administrator modules require status filtering",
);
assert(
  mobileScreen.includes("formatNumber(value, locale") &&
    mobileScreen.includes("scrollRef.current?.scrollTo({ y: 0, animated: false })"),
  "Administrator modules must localize numeric metrics and reset scroll position when the module changes",
);
assert(
  mobileScreen.includes("modulePage"),
  "Mobile administrator modules require pagination state",
);
assert(
  mobileApi.includes('readNumber(sourcePagination, "totalPages")'),
  "Mobile administrator pagination must understand the company API totalPages contract",
);
assert(
  mobileApi.includes("/api/admin/companies?page=${page}&pageSize=100") &&
    mobileApi.includes("page <= totalPages"),
  "Mobile manual-subscription company options must not stop at the first page",
);
assert(
  supportService.includes(
    "nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null",
  ),
  "Support message pagination must continue from the oldest row of the newest-first page",
);
assert(
  mobileScreen.includes("seen.has(message.id)") &&
    mobileScreen.includes("seen.add(message.id)"),
  "Mobile support history pagination must de-duplicate overlapping message pages",
);
assert(
  subscriptionRoute.includes("prisma.subscription.groupBy") &&
    trialEntitlementRoute.includes("prisma.trialEntitlement.groupBy"),
  "Subscription and trial-risk KPI responses must aggregate across the filtered result set",
);
assert(
  securityEventsRoute.includes("metrics: {") &&
    mobileApi.includes("const serverMetrics = primitiveRecord(raw.metrics)") &&
    mobileApi.includes('readNumber(record(raw.pagination), "total")'),
  "Mobile administrator KPIs must prefer server-wide metrics and pagination totals",
);
assert(
  mobileScreen.includes("canReadAdminModule") &&
    mobileScreen.includes("adminPermissions"),
  "Direct mobile navigation must deny users without the module read permission",
);
assert(
  mobileScreen.includes("appliedSupportSearch") &&
    platformLoadSection.includes("appliedSupportSearch") &&
    !platformLoadSection.includes("supportSearch.trim()"),
  "Support search must load only an applied/debounced query, never the draft value on every keystroke",
);
assert(
  requestGenerationGuardCount(mobileScreen) >= 2,
  "Platform module and subscription-request loads must ignore stale responses with independent request-generation guards",
);
assert(
  mobileScreen.includes("moduleLoadError") &&
    mobileScreen.includes("showModuleContent") &&
    mobileScreen.includes("showSubscriptionRequestContent"),
  "Platform load errors must be separate from action errors and mutually exclusive with normal/empty content",
);
assert(
  requestGenerationGuardCount(mobileNotificationScreen) >= 2,
  "Notification initial and pagination loads must ignore stale responses with request-generation guards",
);
assert(
  mobileNotificationScreen.includes("notificationLoadError") &&
    mobileNotificationScreen.includes("notificationLoadMoreError") &&
    mobileNotificationScreen.includes("showNotificationContent"),
  "Notification fatal, pagination and normal/empty states must be represented separately",
);
assert(
  notificationLoadMoreSection.includes("setNotificationLoadMoreError") &&
    !notificationLoadMoreSection.includes("setNotificationLoadError"),
  "Notification pagination failure must stay inline and must not replace the screen with a fatal load error",
);

for (const secret of [
  "secretEncrypted",
  "pairingCode",
  "qrCode",
  "passwordHash",
  "refreshToken",
  "sessionTokenHash",
  "providerSessionId",
]) {
  assert(
    !snapshotService.includes(secret),
    `Sensitive field referenced by administrator snapshot service: ${secret}`,
  );
}

for (const supportedAction of [
  "runAdminCompanyAction",
  "runAdminUserAction",
  "runAdminSubscriptionAction",
  "confirmAdminPayment",
  "rejectAdminPayment",
  "runAdminTrialDecision",
]) {
  assert(
    mobileScreen.includes(supportedAction),
    `Supported mobile administrator mutation is not connected: ${supportedAction}`,
  );
}

async function verifyPlatformOwnerAuthorization() {
  const { isAuthorizedLogivyaPlatformAdmin } =
    await import("../src/server/auth/platform-owner");
  assert(
    isAuthorizedLogivyaPlatformAdmin({ email: " PLATFORM-OWNER@EXAMPLE.COM " }),
    "The platform owner must be authorized after server-side email normalization",
  );
  assert(
    !isAuthorizedLogivyaPlatformAdmin({
      email: "normal-user@example.com",
      role: "SUPER_ADMIN",
      isActive: true,
    }),
    "Roles and client flags must never authorize another email as platform owner",
  );
  console.log(
    "Mobile administrator parity and security contract checks passed.",
  );
}

void verifyPlatformOwnerAuthorization().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
