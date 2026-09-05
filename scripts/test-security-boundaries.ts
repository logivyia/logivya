import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";

// This suite is offline: synthetic requests only, no real cookies, DB or Redis.
Object.assign(process.env, {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/security_tests_only",
  APP_URL: "https://www.logivya.com",
  NEXT_PUBLIC_APP_URL: "https://www.logivya.com",
});
globalThis.fetch = async () => { throw new Error("NETWORK_DISABLED_IN_SECURITY_TEST"); };
Object.assign(globalThis, { AsyncLocalStorage });
let NextRequest: typeof import("next/server").NextRequest;

let passed = 0;
let failed = 0;
async function check(name: string, run: () => unknown | Promise<unknown>) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error instanceof Error ? error.message : "assertion failed"}`); }
}

function request(headers: Record<string, string> = {}, pathname = "/api/billing/subscription-requests") {
  return new NextRequest(`https://www.logivya.com${pathname}`, {
    method: "POST",
    headers: { host: "www.logivya.com", origin: "https://www.logivya.com", cookie: "logivya_session=synthetic-test-cookie", ...headers },
  });
}

async function main() {
  ({ NextRequest } = await import("next/server"));
  const { unstable_doesMiddlewareMatch: doesProxyMatch } = await import("next/dist/experimental/testing/server/middleware-testing-utils");
  const { proxy, config } = await import("../src/proxy");
  const { assertAdminCsrf } = await import("../src/server/security/admin-request");
  const { assertSubscriptionRequestCsrf } = await import("../src/server/billing/subscription-request-security");
  const { assertSafeExternalUrl } = await import("../src/server/security/urls");
  const { assertWebMutationOrigin } = await import("../src/server/security/request-origin");
  const { readBoundedRequestBytes, readBoundedRequestText, readBoundedFormData, RequestBodyError } = await import("../src/server/security/request-body");
  const { adminRateLimitPolicy, consumeAdminRateLimit, ADMIN_RATE_LIMIT_SCRIPT } = await import("../src/server/security/admin-rate-limit");
  const { HmacWebhookSigner } = await import("../src/server/security/webhook-signing");

  await check("legitimate browser mutation is allowed", () => assert.equal(proxy(request()).status, 200));
  await check("cross-origin cookie mutation is rejected", () => assert.equal(proxy(request({ origin: "https://attacker.example" })).status, 403));
  await check("unverified Bearer cannot bypass cookie CSRF", () => assert.equal(proxy(request({ origin: "https://attacker.example", authorization: "Bearer invalid" })).status, 403));
  await check("billing ignores forged Bearer CSRF exemption", () => assert.throws(() => assertSubscriptionRequestCsrf(request({ origin: "https://attacker.example", authorization: "Bearer invalid" })), /CSRF_REJECTED/));
  await check("forwarded host cannot authorize attacker origin", () => assert.throws(() => assertAdminCsrf(request({ origin: "https://attacker.example", "x-forwarded-host": "attacker.example" })), /CSRF_REJECTED/));
  await check("origin scheme is checked, not just hostname", () => assert.throws(() => assertAdminCsrf(request({ origin: "http://www.logivya.com" })), /CSRF_REJECTED/));
  await check("malformed origin has controlled rejection", () => assert.throws(() => assertAdminCsrf(request({ origin: "invalid" })), /CSRF_REJECTED/));
  await check("static-looking API paths still enter proxy", () => assert(doesProxyMatch({ config, url: "/api/categories/example.png" })));
  for (const origin of ["", "null", "https://www.logivya.com.attacker.example", "https://user:pass@www.logivya.com", "https://www.logivya.com/path", "https://www.logivya.com?x=1", "https://www.logivya.com#x"]) {
    await check(`invalid web origin is rejected: ${JSON.stringify(origin)}`, () => assert.equal(proxy(request({ origin })).status, 403));
  }
  await check("conflicting Fetch Metadata is denied", () => assert.equal(proxy(request({ "sec-fetch-site": "cross-site" })).status, 403));
  await check("verified native auth remains the route's responsibility", () => assert.equal(proxy(new NextRequest("https://www.logivya.com/api/mobile/messages/send", { method: "POST", headers: { authorization: "Bearer synthetic" } })).status, 200));
  await check("anonymous admin access is rejected", () => assert.equal(proxy(new NextRequest("https://www.logivya.com/api/admin/users", { method: "POST" })).status, 401));
  await check("login CSRF is rejected before a cookie exists", () => assert.equal(proxy(new NextRequest("https://www.logivya.com/api/auth/login", { method: "POST", headers: { origin: "https://attacker.example" } })).status, 403));
  await check("legitimate first login is allowed", () => assert.equal(proxy(new NextRequest("https://www.logivya.com/api/auth/login", { method: "POST", headers: { origin: "https://www.logivya.com" } })).status, 200));
  await check("cookie-free payment webhooks still reach signature verification", () => assert.equal(proxy(new NextRequest("https://www.logivya.com/api/webhooks/payment/stripe", { method: "POST" })).status, 200));
  await check("read-only requests need no Origin", () => assert.doesNotThrow(() => assertWebMutationOrigin(new Request("https://www.logivya.com/api/groups"))));
  await check("configured origin works behind reverse proxy", () => assert.doesNotThrow(() => assertAdminCsrf(new Request("http://logivya-web:3000/api/admin/users", { method: "POST", headers: { origin: "https://www.logivya.com", host: "logivya-web:3000", "x-forwarded-host": "attacker.example" } }))));
  await check("production fails closed without origin configuration", () => {
    const old = { APP_URL: process.env.APP_URL, NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL, CSRF_TRUSTED_ORIGINS: process.env.CSRF_TRUSTED_ORIGINS };
    try {
      delete process.env.APP_URL; delete process.env.NEXT_PUBLIC_APP_URL; delete process.env.CSRF_TRUSTED_ORIGINS;
      assert.throws(() => assertAdminCsrf(request()), /CSRF_REJECTED/);
    } finally { for (const [key, value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
  });
  await check("explicit additional origin is supported without wildcards", () => {
    const old = process.env.CSRF_TRUSTED_ORIGINS;
    try {
      process.env.CSRF_TRUSTED_ORIGINS = "https://logivya.com";
      assert.doesNotThrow(() => assertAdminCsrf(request({ origin: "https://logivya.com" })));
      assert.throws(() => assertAdminCsrf(request({ origin: "https://logivya.com.attacker.example" })), /CSRF_REJECTED/);
    } finally { if (old === undefined) delete process.env.CSRF_TRUSTED_ORIGINS; else process.env.CSRF_TRUSTED_ORIGINS = old; }
  });
  for (const path of ["/api/admin/users/avatar.jpg", "/api/messages/example.woff2", "/api/test.png", "/api/test"]) {
    await check(`proxy covers ${path}`, () => assert(doesProxyMatch({ config, url: path })));
  }
  await check("actual static assets remain excluded", () => assert.equal(doesProxyMatch({ config, url: "/_next/static/chunks/app.js" }), false));
  for (const url of ["https://[::ffff:127.0.0.1]/", "https://[::ffff:7f00:1]/", "https://localhost./", "https://100.64.0.1/", "https://224.0.0.1/"]) {
    await check(`URL guard rejects special-address target ${url}`, () => assert.throws(() => assertSafeExternalUrl(url)));
  }
  for (const url of ["https://0x7f000001/", "https://2130706433/", "https://169.254.169.254/", "https://192.168.1.1/", "https://[fd00::1]/", "https://[fe80::1]/", "https://[2002:7f00:1::]/", "https://[2001:db8::1]/", "https://service.local./", "https://metadata.google.internal/"]) {
    await check(`URL guard rejects normalized/reserved target ${url}`, () => assert.throws(() => assertSafeExternalUrl(url)));
  }
  for (const url of ["https://example.com/hook", "https://8.8.8.8/", "https://[2606:4700:4700::1111]/"]) {
    await check(`public URL syntax is retained ${url}`, () => assert.doesNotThrow(() => assertSafeExternalUrl(url)));
  }

  function streamedBody(headers: Record<string, string>, chunks: number[]) {
    let reads = 0;
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { if (reads === chunks.length) controller.close(); else controller.enqueue(new Uint8Array(chunks[reads++])); },
      cancel() { canceled = true; },
    }, { highWaterMark: 0 });
    const value = new Request("https://www.logivya.com/api/test", { method: "POST", headers, body, duplex: "half" } as RequestInit);
    return { value, state: () => ({ reads, canceled }) };
  }
  for (const headers of [{}, { "content-length": "2" }]) {
    await check(`oversized stream stops before parsing (${JSON.stringify(headers)})`, async () => {
      const stream = streamedBody(headers, [3, 3, 3, 3, 3]);
      await assert.rejects(readBoundedRequestBytes(stream.value, 8), (error) => error instanceof RequestBodyError && error.status === 413);
      assert.deepEqual(stream.state(), { reads: 3, canceled: true });
    });
  }
  await check("oversized advertised length is rejected before reading", async () => {
    const stream = streamedBody({ "content-length": "999" }, [3]);
    await assert.rejects(readBoundedRequestBytes(stream.value, 8), /REQUEST_BODY_TOO_LARGE/);
    assert.deepEqual(stream.state(), { reads: 0, canceled: true });
  });
  for (const length of ["-1", "NaN", "1e6", "2, 2", "9007199254740992"]) {
    await check(`malformed Content-Length denied: ${length}`, () => assert.rejects(readBoundedRequestBytes(streamedBody({ "content-length": length }, [1]).value, 8), /REQUEST_BODY_INVALID_LENGTH/));
  }
  await check("byte budget counts UTF-8 bytes, not characters", () => assert.rejects(readBoundedRequestText(new Request("https://www.logivya.com", { method: "POST", body: "ğğğ" }), 4), /REQUEST_BODY_TOO_LARGE/));
  await check("stream exactly at budget is accepted", async () => assert.equal((await readBoundedRequestBytes(streamedBody({}, [3, 5]).value, 8)).length, 8));
  await check("empty body is supported", async () => assert.equal((await readBoundedRequestBytes(new Request("https://www.logivya.com", { method: "POST" }), 8)).length, 0));
  await check("stalled stream is canceled at deadline", async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({ pull() { return new Promise<void>(() => {}); }, cancel() { canceled = true; } });
    await assert.rejects(readBoundedRequestBytes(new Request("https://www.logivya.com", { method: "POST", body, duplex: "half" } as RequestInit), 8, 10), /REQUEST_BODY_TIMEOUT/);
    assert(canceled);
  });
  await check("bounded multipart keeps file and form contents", async () => {
    const form = new FormData();
    form.set("token", "local-test-token");
    form.set("file", new Blob(["test contents"], { type: "text/plain" }), "test.txt");
    const parsed = await readBoundedFormData(new Request("https://www.logivya.com", { method: "POST", body: form }), 2048);
    assert.equal(parsed.get("token"), "local-test-token");
    assert.equal(await (parsed.get("file") as File).text(), "test contents");
  });
  await check("webhook bytes remain signature-compatible", async () => {
    const original = '{ "text": "İstanbul", "value": 1 }\r\n';
    const signer = new HmacWebhookSigner();
    const signature = await signer.sign(original, "synthetic-signing-secret");
    const received = await readBoundedRequestText(new Request("https://www.logivya.com", { method: "POST", body: original }), 2048);
    assert.equal(received, original);
    assert(await signer.verify(received, signature, "synthetic-signing-secret"));
    assert.equal(await signer.verify(received + " ", signature, "synthetic-signing-secret"), false);
  });
  await check("admin quota cannot be reset by rotating forwarded IP", () => {
    assert.deepEqual(adminRateLimitPolicy(request({ "x-forwarded-for": "1.1.1.1" }), "test-user", "admin.users.write"), adminRateLimitPolicy(request({ "x-forwarded-for": "8.8.8.8" }), "test-user", "admin.users.write"));
    assert.notEqual(adminRateLimitPolicy(request(), "other-user", "admin.users.write").key, adminRateLimitPolicy(request(), "test-user", "admin.users.write").key);
  });
  await check("admin limiter uses one atomic operation and enforces quota", async () => {
    const policy = adminRateLimitPolicy(request(), "test-user", "admin.users.write");
    let calls = 0;
    const client = { async eval(script: string, keys: number, ...args: (string | number)[]) {
      assert.equal(script, ADMIN_RATE_LIMIT_SCRIPT); assert.equal(keys, 1);
      assert.deepEqual(args, [policy.key, 600, 20]);
      return ++calls;
    } };
    for (let i = 0; i < 20; i++) await consumeAdminRateLimit(client, policy);
    await assert.rejects(consumeAdminRateLimit(client, policy), /ADMIN_RATE_LIMITED/);
  });
  await check("admin limiter fails closed on unavailable or invalid storage", async () => {
    const policy = adminRateLimitPolicy(request(), "test-user", "admin.users.write");
    await assert.rejects(consumeAdminRateLimit({ async eval() { throw new Error("offline"); } }, policy), /offline/);
    await assert.rejects(consumeAdminRateLimit({ async eval() { return "not-a-counter"; } }, policy), /ADMIN_RATE_LIMIT_UNAVAILABLE/);
  });
  await check("patched configuration merge handles recursive graphs without stack exhaustion", async () => {
    const { deepmerge } = await import("deepmerge-ts");
    const left: { self?: unknown; a: number } = { a: 1 }; left.self = left;
    const right: { self?: unknown; b: number } = { b: 2 }; right.self = right;
    assert.doesNotThrow(() => deepmerge(left, right));
    assert.deepEqual(deepmerge({ migrations: { path: "prisma/migrations" } }, { datasource: { url: "test-only" } }), { migrations: { path: "prisma/migrations" }, datasource: { url: "test-only" } });
  });
  console.log(`Security boundary tests: ${passed} passed, ${failed} failed. No network or persistent data mutations.`);
  if (failed) process.exitCode = 1;
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
