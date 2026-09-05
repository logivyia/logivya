const fs = require("node:fs");
const path = require("node:path");

const baseUrl = String(process.env.LOGIVYA_BASE_URL || "https://www.logivya.com").replace(/\/$/, "");
const email = String(process.env.TARGET_REVIEW_EMAIL || "appstore-expired-review@logivya.com")
  .trim()
  .toLowerCase();

function resolveReviewPassword() {
  if (process.env.APPLE_REVIEW_PASSWORD) return process.env.APPLE_REVIEW_PASSWORD;
  const contractPath = path.join(process.cwd(), "scripts", "test-apple-iap-contracts.ts");
  const source = fs.readFileSync(contractPath, "utf8");
  const match = source.match(/LogivyaReview[0-9]+!/);
  if (!match) throw new Error("APPLE_REVIEW_PASSWORD_NOT_AVAILABLE");
  return match[0];
}

async function parseResponse(response) {
  const body = await response.json().catch(() => null);
  return { response, body, payload: body?.data ?? body };
}

async function main() {
  const login = await parseResponse(await fetch(`${baseUrl}/api/mobile/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: email,
      password: resolveReviewPassword(),
      deviceId: `apple-review-expired-verification-${Date.now()}`,
      platform: "IOS",
      appVersion: "1.0.168",
    }),
  }));
  if (!login.response.ok || !login.payload?.tokens?.accessToken) {
    throw new Error(`LOGIN_VERIFICATION_FAILED:${login.response.status}:${login.body?.error?.code || "UNKNOWN"}`);
  }

  const token = login.payload.tokens.accessToken;
  const [subscription, context] = await Promise.all([
    parseResponse(await fetch(`${baseUrl}/api/mobile/subscription/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })),
    parseResponse(await fetch(`${baseUrl}/api/mobile/subscription/apple/context`, {
      headers: { Authorization: `Bearer ${token}` },
    })),
  ]);

  if (!subscription.response.ok) {
    throw new Error(`SUBSCRIPTION_VERIFICATION_FAILED:${subscription.response.status}`);
  }
  if (!context.response.ok) {
    throw new Error(`APPLE_CONTEXT_VERIFICATION_FAILED:${context.response.status}`);
  }

  const productIds = Array.isArray(context.payload?.productIds) ? context.payload.productIds : [];
  const uniqueProductIds = new Set(productIds);
  const current = subscription.payload?.subscription ?? subscription.payload;
  const expired = current?.status === "EXPIRED" || current?.isExpired === true;
  if (!expired) throw new Error("SUBSCRIPTION_IS_NOT_EXPIRED");
  if (uniqueProductIds.size !== 4) throw new Error(`APPLE_PRODUCT_COUNT_UNEXPECTED:${uniqueProductIds.size}`);

  console.log(JSON.stringify({
    ok: true,
    loginStatus: login.response.status,
    subscriptionStatus: current?.status ?? null,
    isExpired: current?.isExpired ?? null,
    appleProductCount: uniqueProductIds.size,
    canPurchase: context.payload?.canPurchase ?? null,
    hasAppAccountToken: Boolean(context.payload?.appAccountToken),
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
