import process from "node:process";

import {
  AppStoreConnectError,
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";

const APPLY = process.argv.includes("--apply");
const GROUP_REFERENCE_NAME = "Logivya Subscriptions";
const DRAFT_STATES = new Set(["PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW", "REJECTED", "DEVELOPER_REJECTED"]);
const PRODUCTS = [
  {
    productId: "com.logivya.mobile.starter.monthly",
    name: "Logivya Starter Monthly",
    period: "ONE_MONTH",
    groupLevel: 2,
    localizations: {
      "tr": { name: "Başlangıç Aylık", description: "Başlangıç paketine aylık erişim." },
      "en-US": { name: "Starter Monthly", description: "Monthly access to the Starter plan." },
    },
  },
  {
    productId: "com.logivya.mobile.starter.yearly",
    name: "Logivya Starter Yearly",
    period: "ONE_YEAR",
    groupLevel: 2,
    localizations: {
      "tr": { name: "Başlangıç Yıllık", description: "Başlangıç paketine yıllık erişim." },
      "en-US": { name: "Starter Yearly", description: "Yearly access to the Starter plan." },
    },
  },
  {
    productId: "com.logivya.mobile.professional.monthly",
    name: "Logivya Professional Monthly",
    period: "ONE_MONTH",
    groupLevel: 1,
    localizations: {
      "tr": { name: "Profesyonel Aylık", description: "Profesyonel pakete aylık erişim." },
      "en-US": { name: "Professional Monthly", description: "Monthly access to the Professional plan." },
    },
  },
  {
    productId: "com.logivya.mobile.professional.yearly",
    name: "Logivya Professional Yearly",
    period: "ONE_YEAR",
    groupLevel: 1,
    localizations: {
      "tr": { name: "Profesyonel Yıllık", description: "Profesyonel pakete yıllık erişim." },
      "en-US": { name: "Professional Yearly", description: "Yearly access to the Professional plan." },
    },
  },
];

async function request(configuration, pathname, searchParams = {}, options = {}) {
  return (await appStoreConnectRequest(configuration, pathname, searchParams, options)).payload;
}

async function listGroups(configuration) {
  return (await request(
    configuration,
    `/v1/apps/${configuration.appStoreAppId}/subscriptionGroups`,
    { limit: 50 },
  ))?.data ?? [];
}

async function ensureGroup(configuration, report) {
  const existing = (await listGroups(configuration)).find(
    (group) => group.attributes?.referenceName === GROUP_REFERENCE_NAME,
  );
  if (existing) return existing;
  report.actions.push({ action: "create_group", referenceName: GROUP_REFERENCE_NAME });
  if (!APPLY) return null;
  return (await request(configuration, "/v1/subscriptionGroups", {}, {
    method: "POST",
    body: {
      data: {
        type: "subscriptionGroups",
        attributes: { referenceName: GROUP_REFERENCE_NAME },
        relationships: {
          app: { data: { type: "apps", id: configuration.appStoreAppId } },
        },
      },
    },
  }))?.data ?? null;
}

async function ensureDraftVersion(configuration, input) {
  const versions = (await request(
    configuration,
    input.listPath,
    { limit: 50 },
  ))?.data ?? [];
  const existing = versions.find((version) => DRAFT_STATES.has(version.attributes?.state));
  if (existing) return existing;
  if (!APPLY) return null;
  return (await request(configuration, input.createPath, {}, {
    method: "POST",
    body: {
      data: {
        type: input.versionType,
        relationships: {
          [input.relationshipName]: {
            data: { type: input.parentType, id: input.parentId },
          },
        },
      },
    },
  }))?.data ?? null;
}

async function ensureLocalizations(configuration, input, report) {
  if (!input.versionId) {
    for (const locale of Object.keys(input.localizations)) {
      report.actions.push({ action: "create_localization", parent: input.parentLabel, locale });
    }
    return;
  }
  const existing = (await request(
    configuration,
    `/v1/${input.versionType}/${input.versionId}/localizations`,
    { limit: 50 },
  ))?.data ?? [];
  const existingLocales = new Set(existing.map((localization) => localization.attributes?.locale));
  for (const [locale, localization] of Object.entries(input.localizations)) {
    if (existingLocales.has(locale)) continue;
    report.actions.push({ action: "create_localization", parent: input.parentLabel, locale });
    if (!APPLY) continue;
    await request(configuration, input.createPath, {}, {
      method: "POST",
      body: {
        data: {
          type: input.localizationType,
          attributes: { locale, ...localization },
          relationships: {
            version: { data: { type: input.versionType, id: input.versionId } },
          },
        },
      },
    });
  }
}

async function listSubscriptions(configuration, groupId) {
  return (await request(
    configuration,
    `/v1/subscriptionGroups/${groupId}/subscriptions`,
    { limit: 200 },
  ))?.data ?? [];
}

async function ensureSubscription(configuration, groupId, product, report) {
  const existing = (await listSubscriptions(configuration, groupId)).find(
    (subscription) => subscription.attributes?.productId === product.productId,
  );
  if (existing) return existing;
  report.actions.push({ action: "create_subscription", productId: product.productId });
  if (!APPLY) return null;
  return (await request(configuration, "/v1/subscriptions", {}, {
    method: "POST",
    body: {
      data: {
        type: "subscriptions",
        attributes: {
          name: product.name,
          productId: product.productId,
          familySharable: false,
          subscriptionPeriod: product.period,
          groupLevel: product.groupLevel,
          reviewNote: "Logivya messaging plan purchased only with Apple In-App Purchase on iOS.",
        },
        relationships: {
          group: { data: { type: "subscriptionGroups", id: groupId } },
        },
      },
    },
  }))?.data ?? null;
}

async function main() {
  const configuration = loadAppleConfiguration();
  const report = { apply: APPLY, appId: configuration.appStoreAppId, group: null, products: [], actions: [] };
  let group = await ensureGroup(configuration, report);
  if (!group && !APPLY) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (!group) throw new Error("SUBSCRIPTION_GROUP_CREATE_FAILED");
  report.group = { id: group.id, referenceName: group.attributes?.referenceName ?? GROUP_REFERENCE_NAME };

  const groupVersion = await ensureDraftVersion(configuration, {
    listPath: `/v1/subscriptionGroups/${group.id}/versions`,
    createPath: "/v1/subscriptionGroupVersions",
    versionType: "subscriptionGroupVersions",
    relationshipName: "subscriptionGroup",
    parentType: "subscriptionGroups",
    parentId: group.id,
  });
  await ensureLocalizations(configuration, {
    versionId: groupVersion?.id ?? null,
    versionType: "subscriptionGroupVersions",
    localizationType: "subscriptionGroupLocalizations",
    createPath: "/v2/subscriptionGroupLocalizations",
    parentLabel: GROUP_REFERENCE_NAME,
    localizations: {
      "tr": { name: "Logivya Abonelikleri" },
      "en-US": { name: "Logivya Subscriptions" },
    },
  }, report);

  for (const product of PRODUCTS) {
    const subscription = await ensureSubscription(configuration, group.id, product, report);
    if (!subscription && !APPLY) continue;
    if (!subscription) throw new Error(`SUBSCRIPTION_CREATE_FAILED:${product.productId}`);
    const version = await ensureDraftVersion(configuration, {
      listPath: `/v1/subscriptions/${subscription.id}/versions`,
      createPath: "/v1/subscriptionVersions",
      versionType: "subscriptionVersions",
      relationshipName: "subscription",
      parentType: "subscriptions",
      parentId: subscription.id,
    });
    await ensureLocalizations(configuration, {
      versionId: version?.id ?? null,
      versionType: "subscriptionVersions",
      localizationType: "subscriptionLocalizations",
      createPath: "/v2/subscriptionLocalizations",
      parentLabel: product.productId,
      localizations: product.localizations,
    }, report);
    report.products.push({
      id: subscription.id,
      productId: subscription.attributes?.productId ?? product.productId,
      state: subscription.attributes?.state ?? null,
      versionId: version?.id ?? null,
      versionState: version?.attributes?.state ?? null,
    });
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  if (error instanceof AppStoreConnectError) {
    console.error(JSON.stringify({ ok: false, status: error.status, errorCodes: error.codes }));
    process.exit(2);
  }
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "UNKNOWN" }));
  process.exit(3);
});
