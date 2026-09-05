import { execFileSync } from "node:child_process";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const PRINT_CONFIG = process.argv.includes("--print-config");
const PACKAGE_NAME = "com.logivya.mobile";
const QUOTA_PROJECT = "logivya-a5fc7";
const API_ORIGIN = "https://androidpublisher.googleapis.com";
const DRAFT_STATE = "DRAFT";

const PRODUCTS = [
  {
    productId: "logivya_starter",
    listings: [
      {
        languageCode: "tr-TR",
        title: "Logivya Baslangic",
        description: "Iki WhatsApp hesabi icin temel mesajlasma aboneligi.",
        benefits: ["2 WhatsApp hesabi", "Zamanli mesaj", "Herkesten silme"],
      },
      {
        languageCode: "en-US",
        title: "Logivya Starter",
        description: "Core business messaging for up to two WhatsApp accounts.",
        benefits: ["2 WhatsApp accounts", "Scheduled messages", "Delete for everyone"],
      },
    ],
    basePlans: [
      { basePlanId: "monthly", billingPeriodDuration: "P1M", priceTry: 280 },
      { basePlanId: "yearly", billingPeriodDuration: "P1Y", priceTry: 3000 },
    ],
  },
  {
    productId: "logivya_professional",
    listings: [
      {
        languageCode: "tr-TR",
        title: "Logivya Profesyonel",
        description: "Uc WhatsApp hesabi icin reklamsiz gelismis mesajlasma aboneligi.",
        benefits: ["3 WhatsApp hesabi", "Reklamsiz gonderim", "Zamanli mesaj"],
      },
      {
        languageCode: "en-US",
        title: "Logivya Professional",
        description: "Advanced ad-free business messaging for up to three WhatsApp accounts.",
        benefits: ["3 WhatsApp accounts", "Ad-free messages", "Scheduled messages"],
      },
    ],
    basePlans: [
      { basePlanId: "monthly", billingPeriodDuration: "P1M", priceTry: 380 },
      { basePlanId: "yearly", billingPeriodDuration: "P1Y", priceTry: 4200 },
    ],
  },
];

function accessToken() {
  const gcloudScript = path.join(
    process.env.LOCALAPPDATA || "",
    "Google",
    "Cloud SDK",
    "google-cloud-sdk",
    "bin",
    "gcloud.ps1",
  );
  return execFileSync(
    process.platform === "win32" ? "powershell.exe" : "gcloud",
    process.platform === "win32"
      ? [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          gcloudScript,
          "auth",
          "application-default",
          "print-access-token",
        ]
      : ["auth", "application-default", "print-access-token"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).trim();
}

function apiError(payload, status) {
  const message = payload?.error?.message || payload?.message || "Google Play request failed";
  return new Error(`${message} (HTTP ${status})`);
}

async function request(token, pathname, options = {}) {
  const url = new URL(pathname, API_ORIGIN);
  for (const [name, value] of Object.entries(options.query || {})) {
    url.searchParams.set(name, String(value));
  }
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "X-Goog-User-Project": QUOTA_PROJECT,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => null);
  if (options.allow404 && response.status === 404) return null;
  if (!response.ok) throw apiError(payload, response.status);
  return payload;
}

function subscriptionPath(productId = "") {
  const base = `/androidpublisher/v3/applications/${PACKAGE_NAME}/subscriptions`;
  return productId ? `${base}/${encodeURIComponent(productId)}` : base;
}

function moneyTry(amount) {
  return { currencyCode: "TRY", units: String(amount), nanos: 0 };
}

async function convertRegionPrices(token, amount) {
  return request(
    token,
    `/androidpublisher/v3/applications/${PACKAGE_NAME}/pricing:convertRegionPrices`,
    { method: "POST", body: { price: moneyTry(amount) } },
  );
}

function regionalConfigs(conversion, exactTryPrice) {
  return Object.entries(conversion.convertedRegionPrices || {})
    .map(([regionCode, value]) => ({
      regionCode,
      newSubscriberAvailability: true,
      price: regionCode === "TR" ? moneyTry(exactTryPrice) : value.price,
    }))
    .sort((left, right) => left.regionCode.localeCompare(right.regionCode));
}

function otherRegionsConfig(conversion) {
  const other = conversion.convertedOtherRegionsPrice;
  if (!other?.usdPrice || !other?.eurPrice) {
    throw new Error("Google Play did not return fallback USD/EUR prices.");
  }
  return {
    usdPrice: other.usdPrice,
    eurPrice: other.eurPrice,
    newSubscriberAvailability: true,
  };
}

async function desiredSubscription(token, product) {
  const conversions = await Promise.all(
    product.basePlans.map((basePlan) => convertRegionPrices(token, basePlan.priceTry)),
  );
  const regionVersions = new Set(conversions.map((item) => item.regionVersion?.version));
  if (regionVersions.size !== 1 || regionVersions.has(undefined)) {
    throw new Error(`Inconsistent Google Play region versions for ${product.productId}.`);
  }
  return {
    regionVersion: [...regionVersions][0],
    body: {
      packageName: PACKAGE_NAME,
      productId: product.productId,
      listings: product.listings,
      basePlans: product.basePlans.map((basePlan, index) => ({
        basePlanId: basePlan.basePlanId,
        regionalConfigs: regionalConfigs(conversions[index], basePlan.priceTry),
        otherRegionsConfig: otherRegionsConfig(conversions[index]),
        autoRenewingBasePlanType: {
          billingPeriodDuration: basePlan.billingPeriodDuration,
        },
      })),
    },
  };
}

function summary(product) {
  return {
    productId: product.productId,
    basePlans: product.basePlans.map((basePlan) => ({
      basePlanId: basePlan.basePlanId,
      billingPeriodDuration: basePlan.billingPeriodDuration,
      priceTry: basePlan.priceTry,
    })),
  };
}

function normalizeListings(listings) {
  return [...(listings || [])]
    .map((item) => ({
      languageCode: item.languageCode,
      title: item.title,
      description: item.description || "",
      benefits: [...(item.benefits || [])],
    }))
    .sort((left, right) => left.languageCode.localeCompare(right.languageCode));
}

function listingsMatch(existing, desired) {
  return JSON.stringify(normalizeListings(existing)) === JSON.stringify(normalizeListings(desired));
}

function tryPrice(basePlan) {
  return basePlan.regionalConfigs?.find((item) => item.regionCode === "TR")?.price || null;
}

function normalizeMoney(value) {
  if (!value) return null;
  return {
    currencyCode: value.currencyCode || null,
    units: String(value.units || "0"),
    nanos: Number(value.nanos || 0),
  };
}

function planMismatch(audit, desired) {
  return (
    audit.billingPeriodDuration !== desired.billingPeriodDuration ||
    JSON.stringify(normalizeMoney(audit.tryPrice)) !==
      JSON.stringify(normalizeMoney(audit.expectedTryPrice))
  );
}

function planAudit(existing, desiredProduct) {
  const existingPlans = new Map((existing.basePlans || []).map((item) => [item.basePlanId, item]));
  return desiredProduct.basePlans.map((desired) => {
    const current = existingPlans.get(desired.basePlanId);
    return {
      basePlanId: desired.basePlanId,
      state: current?.state || "MISSING",
      billingPeriodDuration: current?.autoRenewingBasePlanType?.billingPeriodDuration || null,
      tryPrice: tryPrice(current || {}),
      expectedTryPrice: moneyTry(desired.priceTry),
    };
  });
}

function activePlanConflicts(existing, product) {
  return planAudit(existing, product).filter((item) => {
    if (item.state !== "ACTIVE") return false;
    const desired = product.basePlans.find((plan) => plan.basePlanId === item.basePlanId);
    return !desired || planMismatch(item, desired);
  });
}

async function activateBasePlans(token, productId, basePlans, actions) {
  for (const basePlan of basePlans) {
    if (basePlan.state === "ACTIVE") continue;
    actions.push({ action: "activate_base_plan", productId, basePlanId: basePlan.basePlanId });
    await request(
      token,
      `${subscriptionPath(productId)}/basePlans/${encodeURIComponent(basePlan.basePlanId)}:activate`,
      { method: "POST", body: {} },
    );
  }
}

async function createSubscription(token, product, actions) {
  const desired = await desiredSubscription(token, product);
  actions.push({ action: "create_subscription", productId: product.productId });
  const created = await request(token, subscriptionPath(), {
    method: "POST",
    query: {
      productId: product.productId,
      "regionsVersion.version": desired.regionVersion,
    },
    body: desired.body,
  });
  await activateBasePlans(token, product.productId, created.basePlans || [], actions);
}

async function updateDraftSubscription(token, existing, product, actions) {
  const conflicts = activePlanConflicts(existing, product);
  if (conflicts.length > 0) {
    throw new Error(
      `Active base-plan mismatch for ${product.productId}: ${JSON.stringify(conflicts)}`,
    );
  }

  const states = new Set((existing.basePlans || []).map((item) => item.state));
  const desiredPlanIds = new Set(product.basePlans.map((item) => item.basePlanId));
  const missingPlan = product.basePlans.some(
    (item) => !(existing.basePlans || []).some((current) => current.basePlanId === item.basePlanId),
  );
  const unexpectedPlan = (existing.basePlans || []).some(
    (item) => !desiredPlanIds.has(item.basePlanId),
  );
  const canReplacePlans = states.size === 0 || (states.size === 1 && states.has(DRAFT_STATE));

  const draftConflicts = planAudit(existing, product).filter((item) => {
    if (item.state !== DRAFT_STATE) return false;
    const desired = product.basePlans.find((plan) => plan.basePlanId === item.basePlanId);
    return !desired || planMismatch(item, desired);
  });

  if ((missingPlan || unexpectedPlan) && !canReplacePlans) {
    throw new Error(
      `Refusing to replace non-draft base plans for ${product.productId}; inspect them in Play Console.`,
    );
  }

  if (draftConflicts.length > 0 && !canReplacePlans) {
    throw new Error(
      `Draft base-plan mismatch beside active plans for ${product.productId}: ${JSON.stringify(draftConflicts)}`,
    );
  }

  const updateListings = !listingsMatch(existing.listings, product.listings);
  const updatePlans = canReplacePlans &&
    (missingPlan || unexpectedPlan || draftConflicts.length > 0 || states.size === 0);
  if (!updateListings && !updatePlans) {
    await activateBasePlans(token, product.productId, existing.basePlans || [], actions);
    return;
  }

  const desired = await desiredSubscription(token, product);
  const updateMask = [updateListings ? "listings" : null, updatePlans ? "basePlans" : null]
    .filter(Boolean)
    .join(",");
  actions.push({ action: "patch_subscription", productId: product.productId, updateMask });
  const updated = await request(token, subscriptionPath(product.productId), {
    method: "PATCH",
    query: {
      updateMask,
      "regionsVersion.version": desired.regionVersion,
      allowMissing: false,
    },
    body: {
      packageName: PACKAGE_NAME,
      productId: product.productId,
      ...(updateListings ? { listings: desired.body.listings } : {}),
      ...(updatePlans ? { basePlans: desired.body.basePlans } : {}),
    },
  });
  await activateBasePlans(token, product.productId, updated.basePlans || [], actions);
}

async function main() {
  const catalog = PRODUCTS.map(summary);
  if (PRINT_CONFIG) {
    console.log(JSON.stringify({ packageName: PACKAGE_NAME, catalog }, null, 2));
    return;
  }

  const token = accessToken();
  const report = { apply: APPLY, packageName: PACKAGE_NAME, products: [], actions: [] };
  for (const product of PRODUCTS) {
    const existing = await request(token, subscriptionPath(product.productId), { allow404: true });
    report.products.push({
      productId: product.productId,
      status: existing ? "EXISTS" : "MISSING",
      listingsMatch: existing ? listingsMatch(existing.listings, product.listings) : false,
      basePlans: existing ? planAudit(existing, product) : summary(product).basePlans,
    });
    if (!APPLY) continue;
    if (!existing) await createSubscription(token, product, report.actions);
    else await updateDraftSubscription(token, existing, product, report.actions);
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "UNKNOWN" }));
  process.exitCode = 1;
});
