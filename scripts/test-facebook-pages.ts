import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

process.env.FACEBOOK_APP_ID = "test-app-id";
process.env.FACEBOOK_APP_SECRET = "test-app-secret";
process.env.FACEBOOK_OAUTH_REDIRECT_URI = "https://www.logivya.com/api/facebook/oauth/callback";
process.env.FACEBOOK_OAUTH_STATE_SECRET = randomBytes(48).toString("base64url");
process.env.FACEBOOK_TOKEN_KEY_ACTIVE_VERSION = "v1";
process.env.FACEBOOK_TOKEN_KEY_V1 = randomBytes(32).toString("base64url");

async function main() {
  const { createFacebookOAuthState, verifyFacebookOAuthState } = await import("../src/server/facebook/oauth-state");
  const { encryptFacebookToken, decryptFacebookToken } = await import("../src/server/facebook/crypto");
  const { createFacebookPostSchema } = await import("../src/server/facebook/posts");
  const { isAmbiguousFacebookPublicationError, isRetryableFacebookPublicationError } = await import("../src/server/facebook/posts");
  const { buildFacebookAuthorizationUrl } = await import("../src/server/facebook/oauth");
  const { FacebookGraphError } = await import("../src/server/facebook/graph-api");
  const { verifyFacebookSignedRequest } = await import("../src/server/facebook/signed-request");

  const state = createFacebookOAuthState({ userId: "user-1", companyId: "company-1", platform: "ANDROID" });
  const verified = verifyFacebookOAuthState(state);
  assert.equal(verified.userId, "user-1");
  assert.equal(verified.companyId, "company-1");
  assert.throws(() => verifyFacebookOAuthState(`${state.slice(0, -1)}x`), /FACEBOOK_OAUTH_STATE_INVALID/);

  const encrypted = encryptFacebookToken("page-access-token");
  assert.notEqual(encrypted, "page-access-token");
  assert.equal(decryptFacebookToken(encrypted), "page-access-token");

  assert.equal(createFacebookPostSchema.safeParse({ pageAccountId: "page-1", message: "Merhaba", mediaFileIds: [] }).success, true);
  assert.equal(createFacebookPostSchema.safeParse({ pageAccountId: "page-1", message: "", mediaFileIds: [] }).success, false);
  assert.equal(createFacebookPostSchema.safeParse({
    pageAccountId: "page-1",
    message: "Planlandı",
    mediaFileIds: [],
    scheduledAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  }).success, true);
  assert.equal(createFacebookPostSchema.safeParse({
    pageAccountId: "page-1",
    message: "Çok erken",
    mediaFileIds: [],
    scheduledAt: new Date(Date.now() + 60_000).toISOString(),
  }).success, false);

  const authorizationUrl = new URL(buildFacebookAuthorizationUrl({
    user: { id: "user-1" },
    company: { id: "company-1" },
    platform: "ANDROID",
  } as Parameters<typeof buildFacebookAuthorizationUrl>[0], state));
  assert.equal(authorizationUrl.hostname, "www.facebook.com");
  assert.equal(authorizationUrl.searchParams.get("client_id"), "test-app-id");
  assert.equal(authorizationUrl.searchParams.get("redirect_uri"), process.env.FACEBOOK_OAUTH_REDIRECT_URI);
  assert.ok(authorizationUrl.searchParams.get("scope")?.includes("pages_manage_posts"));
  assert.ok(authorizationUrl.searchParams.get("state"));

  const signedPayload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "meta-user-1" })).toString("base64url");
  const signedSignature = createHmac("sha256", process.env.FACEBOOK_APP_SECRET as string).update(signedPayload).digest("base64url");
  assert.equal(verifyFacebookSignedRequest(`${signedSignature}.${signedPayload}`).user_id, "meta-user-1");
  assert.throws(() => verifyFacebookSignedRequest(`invalid.${signedPayload}`), /FACEBOOK_SIGNED_REQUEST_INVALID/);

  assert.equal(isRetryableFacebookPublicationError(new Error("FACEBOOK_GRAPH_TIMEOUT")), true);
  assert.equal(isAmbiguousFacebookPublicationError(new Error("FACEBOOK_GRAPH_TIMEOUT")), true);
  assert.equal(isRetryableFacebookPublicationError(new Error("FACEBOOK_RECONNECT_REQUIRED")), false);
  assert.equal(isRetryableFacebookPublicationError(new FacebookGraphError(503, { error: { code: 2 } })), true);
  assert.equal(isRetryableFacebookPublicationError(new FacebookGraphError(400, { error: { code: 190 } })), false);

  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const posts = readFileSync("src/server/facebook/posts.ts", "utf8");
  const callback = readFileSync("src/app/api/facebook/oauth/callback/route.ts", "utf8");
  assert.match(schema, /model FacebookPublicationJob/);
  assert.match(schema, /model FacebookOAuthTransaction/);
  assert.match(posts, /idempotencyKey/);
  assert.match(posts, /recoverStaleFacebookPublications/);
  assert.match(callback, /verifyAndConsumeFacebookOAuthState/);

  console.log("Facebook Pages contracts: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
