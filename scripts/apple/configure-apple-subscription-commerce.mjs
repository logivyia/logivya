import process from "node:process";

import {
  AppStoreConnectError,
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";

const APPLY = process.argv.includes("--apply");
const GROUP_REFERENCE_NAME = "Logivya Subscriptions";
const BASE_TERRITORY = "TUR";
const PLAN_TYPE = "UPFRONT";
const PRODUCTS = {
  "com.logivya.mobile.starter.monthly": 280,
  "com.logivya.mobile.starter.yearly": 3000,
  "com.logivya.mobile.professional.monthly": 380,
  "com.logivya.mobile.professional.yearly": 4200,
};

async function request(configuration, pathname, searchParams = {}, options = {}) {
  return (await appStoreConnectRequest(configuration, pathname, searchParams, options)).payload;
}

async function listAll(configuration, pathname, searchParams = {}) {
  const items = [];
  let nextPath = pathname;
  let nextSearch = { ...searchParams };

  while (nextPath) {
    const payload = await request(configuration, nextPath, nextSearch);
    items.push(...(payload?.data ?? []));
    if (!payload?.links?.next) break;
    const next = new URL(payload.links.next);
    nextPath = next.pathname;
    nextSearch = Object.fromEntries(next.searchParams.entries());
  }

  return items;
}

async function findSubscriptionGroup(configuration) {
  const groups = await listAll(
    configuration,
    `/v1/apps/${configuration.appStoreAppId}/subscriptionGroups`,
    { limit: 200 },
  );
  return groups.find((group) => group.attributes?.referenceName === GROUP_REFERENCE_NAME) ?? null;
}

async function listSubscriptions(configuration, groupId) {
  return listAll(configuration, `/v1/subscriptionGroups/${groupId}/subscriptions`, { limit: 200 });
}

async function listTerritories(configuration) {
  return listAll(configuration, "/v1/territories", { limit: 200 });
}

async function listPricePoints(configuration, subscriptionId, territoryId) {
  return listAll(configuration, `/v1/subscriptions/${subscriptionId}/pricePoints`, {
    "filter[planType]": PLAN_TYPE,
    "filter[territory]": territoryId,
    include: "territory",
    limit: 8000,
  });
}

function nearestPricePoint(pricePoints, targetPrice) {
  const ranked = pricePoints
    .map((pricePoint) => ({
      pricePoint,
      customerPrice: Number(pricePoint.attributes?.customerPrice),
    }))
    .filter((candidate) => Number.isFinite(candidate.customerPrice))
    .sort((left, right) => {
      const difference = Math.abs(left.customerPrice - targetPrice) - Math.abs(right.customerPrice - targetPrice);
      return difference || left.customerPrice - right.customerPrice;
    });
  if (!ranked[0]) throw new Error(`PRICE_POINT_NOT_FOUND:${targetPrice}`);
  return ranked[0];
}

async function equalizedPricePoints(configuration, basePricePoint) {
  const equalizations = await listAll(
    configuration,
    `/v1/subscriptionPricePoints/${basePricePoint.id}/equalizations`,
    { "filter[planType]": PLAN_TYPE, include: "territory", limit: 8000 },
  );
  return [basePricePoint, ...equalizations];
}

async function listPrices(configuration, subscriptionId) {
  return listAll(configuration, `/v1/subscriptions/${subscriptionId}/prices`, {
    "filter[planType]": PLAN_TYPE,
    include: "territory,subscriptionPricePoint",
    limit: 200,
  });
}

async function createPrice(configuration, subscriptionId, pricePoint) {
  const territoryId = pricePoint.relationships?.territory?.data?.id;
  if (!territoryId) throw new Error(`PRICE_POINT_TERRITORY_MISSING:${pricePoint.id}`);
  await request(configuration, "/v1/subscriptionPrices", {}, {
    method: "POST",
    body: {
      data: {
        type: "subscriptionPrices",
        attributes: {
          startDate: null,
          preserveCurrentPrice: false,
          planType: PLAN_TYPE,
        },
        relationships: {
          subscription: { data: { type: "subscriptions", id: subscriptionId } },
          subscriptionPricePoint: {
            data: { type: "subscriptionPricePoints", id: pricePoint.id },
          },
        },
      },
    },
  });
}

async function getPlanAvailability(configuration, subscriptionId) {
  const availabilities = await listAll(
    configuration,
    `/v1/subscriptions/${subscriptionId}/planAvailabilities`,
    { limit: 200 },
  );
  return availabilities.find((availability) => availability.attributes?.planType === PLAN_TYPE) ?? null;
}

async function createPlanAvailability(configuration, subscriptionId, territories) {
  await request(configuration, "/v1/subscriptionPlanAvailabilities", {}, {
    method: "POST",
    body: {
      data: {
        type: "subscriptionPlanAvailabilities",
        attributes: { availableInNewTerritories: true, planType: PLAN_TYPE },
        relationships: {
          subscription: { data: { type: "subscriptions", id: subscriptionId } },
          availableTerritories: {
            data: territories.map((territory) => ({ type: "territories", id: territory.id })),
          },
        },
      },
    },
  });
}

async function main() {
  const configuration = loadAppleConfiguration();
  const group = await findSubscriptionGroup(configuration);
  if (!group) throw new Error("SUBSCRIPTION_GROUP_NOT_FOUND");

  const [subscriptions, territories] = await Promise.all([
    listSubscriptions(configuration, group.id),
    listTerritories(configuration),
  ]);
  const territoryIds = new Set(territories.map((territory) => territory.id));
  const report = {
    apply: APPLY,
    appId: configuration.appStoreAppId,
    territoryCount: territories.length,
    products: [],
  };

  for (const [productId, targetPrice] of Object.entries(PRODUCTS)) {
    const subscription = subscriptions.find((item) => item.attributes?.productId === productId);
    if (!subscription) throw new Error(`SUBSCRIPTION_NOT_FOUND:${productId}`);

    const basePoints = await listPricePoints(configuration, subscription.id, BASE_TERRITORY);
    const selected = nearestPricePoint(basePoints, targetPrice);
    const equalizations = await equalizedPricePoints(configuration, selected.pricePoint);
    const selectedByTerritory = new Map(
      equalizations.map((pricePoint) => [pricePoint.relationships?.territory?.data?.id, pricePoint]),
    );
    const missingEqualizations = [...territoryIds].filter((territoryId) => !selectedByTerritory.has(territoryId));
    if (missingEqualizations.length > 0) {
      throw new Error(`PRICE_EQUALIZATIONS_MISSING:${productId}:${missingEqualizations.join(",")}`);
    }

    const currentPrices = await listPrices(configuration, subscription.id);
    const currentTerritories = new Set(
      currentPrices
        .map((price) => price.relationships?.territory?.data?.id)
        .filter(Boolean),
    );
    const pricesToCreate = territories
      .filter((territory) => !currentTerritories.has(territory.id))
      .map((territory) => selectedByTerritory.get(territory.id));
    const availability = await getPlanAvailability(configuration, subscription.id);

    if (APPLY) {
      if (!availability) await createPlanAvailability(configuration, subscription.id, territories);
      for (const pricePoint of pricesToCreate) {
        await createPrice(configuration, subscription.id, pricePoint);
      }
      process.stderr.write(`Configured ${productId} for ${territories.length} territories.\n`);
    }

    report.products.push({
      id: subscription.id,
      productId,
      targetPrice,
      selectedBasePrice: selected.customerPrice,
      baseTerritory: BASE_TERRITORY,
      planType: PLAN_TYPE,
      priceCountBefore: currentPrices.length,
      pricesToCreate: pricesToCreate.length,
      availabilityExists: Boolean(availability),
      availabilityAction: availability ? "none" : "create_all_territories",
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
