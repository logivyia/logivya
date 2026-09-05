import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const account = { id: 'own-account', label: 'Synthetic Telegram', status: 'AUTHENTICATING', authState: 'WAIT_PHONE_NUMBER' };
const calls = [], audits = [];
let allowed = true, limited = false, workerError = '', created = false;
const mocks = {
  access: { requireWebTelegramAccess: async () => { if (!allowed) throw new Error('UNAUTHORIZED'); return { user: { id: 'user-a' }, company: { id: 'company-a' } }; } },
  accounts: {
    listOwnedTelegramAccounts: async (user, company) => { assert.equal(user, 'user-a'); assert.equal(company, 'company-a'); return [{ ...account }]; },
    requireOwnedTelegramAccount: async (id, user, company) => { assert.equal(user, 'user-a'); assert.equal(company, 'company-a'); if (id !== account.id) throw new Error('TELEGRAM_ACCOUNT_NOT_FOUND'); return { ...account }; },
    createOwnedTelegramAccount: async (input) => { assert.equal(input.ownerUserId, 'user-a'); assert.equal(input.companyId, 'company-a'); const result = { account: { ...account }, created: !created }; created = true; return result; },
  },
  audit: { writeAuditLog: async (_request, entry) => { audits.push(entry); } },
  rate: { enforceOperationRateLimit: async (input) => { assert.equal(input.subject, 'company-a:user-a'); if (limited) throw new Error('RATE_LIMITED'); } },
  worker: { callTelegramWorker: async (path, init) => {
    calls.push({ path, ...init });
    if (workerError) throw new Error(workerError);
    if (path.endsWith('/start')) account.authState = 'WAIT_PHONE_NUMBER';
    if (path.endsWith('/auth')) {
      account.authState = ({ phone: 'WAIT_CODE', code: 'WAIT_PASSWORD', password: 'READY', email: 'WAIT_EMAIL_CODE', email_code: 'READY' })[init.body.step];
      account.status = account.authState === 'READY' ? 'CONNECTED' : 'AUTHENTICATING';
    }
    return { authState: account.authState, ...(path.endsWith('/sync') ? { synced: 2, sendable: 1 } : {}) };
  } },
};
const redirects = {
  '@/server/web/communication-access': 'access', '@/server/telegram/accounts': 'accounts',
  '@/server/security/audit': 'audit', '@/server/security/operation-rate-limit': 'rate', '@/server/telegram/worker-client': 'worker',
};
const bundled = await build({ entryPoints: ['src/app/api/web/telegram/accounts/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'isolated-services', setup(b) {
  b.onResolve({ filter: /.*/ }, args => redirects[args.path] ? { path: redirects[args.path], namespace: 'stub' } : args.path === 'server-only' ? { path: 'empty', namespace: 'stub' } : undefined);
  b.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: args.path === 'empty' ? '' : `module.exports = globalThis.testServices[${JSON.stringify(args.path)}];` }));
} }] });
const module = { exports: {} };
vm.runInNewContext(bundled.outputFiles[0].text, { module, exports: module.exports, require, testServices: mocks, process, Request, Response, Headers, URL, Buffer, setTimeout, clearTimeout, console, Error });
const route = module.exports;
const previous = process.env.APP_URL;
process.env.APP_URL = 'https://www.logivya.com';
const results = [];
async function post(body, origin = 'https://www.logivya.com') {
  const response = await route.POST(new Request('https://www.logivya.com/api/web/telegram/accounts', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
  return { status: response.status, headers: response.headers, body: await response.json() };
}
try {
  allowed = false;
  assert.equal((await route.GET()).status, 401);
  assert.equal((await post({ action: 'create' })).status, 401);
  assert.equal(calls.length, 0);
  allowed = true;
  assert.equal((await post({ action: 'create' }, 'https://attacker.invalid')).status, 403);
  assert.equal((await post({ action: 'create' }, '')).status, 403);
  assert.equal(calls.length, 0); results.push('web-session-and-csrf');
  for (const action of ['start', 'sync', 'auth']) {
    assert.equal((await post({ action, accountId: 'someone-else', ...(action === 'auth' ? { auth: { step: 'phone', value: '+998901234567' } } : {}) })).status, 404);
  }
  assert.equal(calls.length, 0); results.push('ownership-before-worker-for-every-action');
  assert.equal((await post('{bad-json')).status, 400);
  assert.equal((await post({ action: 'start', accountId: '../another' })).status, 400);
  assert.equal((await post({ action: 'create', ownerUserId: 'attacker' })).status, 400);
  assert.equal((await post('x'.repeat(4097))).status, 413); results.push('bounded-strict-input');
  assert.equal((await post({ action: 'sync', accountId: account.id })).status, 409);
  limited = true;
  assert.equal((await post({ action: 'create' })).status, 429);
  assert.equal(calls.length, 0);
  limited = false; results.push('rate-limit-and-disconnected-sync');
  assert.equal((await post({ action: 'create' })).status, 201);
  assert.equal((await post({ action: 'create' })).status, 200);
  assert.equal((await post({ action: 'start', accountId: account.id })).status, 200);
  assert.equal((await post({ action: 'auth', accountId: account.id, auth: { step: 'phone', value: 'invalid-number' } })).status, 400);
  const phone = await post({ action: 'auth', accountId: account.id, auth: { step: 'phone', value: '+998 90 123 45 67' } });
  assert.equal(phone.body.accounts[0].authState, 'WAIT_CODE');
  assert.equal(calls.at(-1).body.value, '+998901234567');
  workerError = 'PHONE_CODE_INVALID';
  assert.equal((await post({ action: 'auth', accountId: account.id, auth: { step: 'code', value: '76543' } })).body.error, 'TELEGRAM_AUTH_INVALID');
  workerError = '';
  assert.equal((await post({ action: 'auth', accountId: account.id, auth: { step: 'code', value: '76543' } })).body.accounts[0].authState, 'WAIT_PASSWORD');
  const password = ' synthetic password with spaces ';
  const authenticated = await post({ action: 'auth', accountId: account.id, auth: { step: 'password', value: password } });
  assert.equal(calls.at(-1).body.value, password);
  assert.equal(authenticated.body.accounts[0].authState, 'READY');
  assert.equal(authenticated.body.accounts[0].status, 'CONNECTED');
  assert.equal((await post({ action: 'sync', accountId: account.id })).body.synced, 2);
  assert.equal(calls.at(-1).timeoutMs, 60000);
  const auditText = JSON.stringify(audits);
  for (const secret of ['+998901234567', '76543', password]) assert.equal(auditText.includes(secret), false);
  assert.equal(JSON.stringify(authenticated.body).includes(password), false); results.push('phone-code-2fa-sync-and-secret-redaction');
  workerError = 'FLOOD_WAIT_300';
  const before = calls.length;
  const flood = await post({ action: 'start', accountId: account.id });
  assert.equal(flood.status, 429); assert.equal(flood.body.retryAfterSeconds, 300); assert.equal(flood.headers.get('retry-after'), '300');
  assert.equal(calls.length, before + 1); results.push('provider-wait-no-auto-retry');
  workerError = 'unexpected secret from provider';
  assert.equal(JSON.stringify((await post({ action: 'start', accountId: account.id })).body).includes(workerError), false);
  workerError = '';
  for (const step of ['email', 'email_code']) assert.equal((await post({ action: 'auth', accountId: account.id, auth: { step, value: step === 'email' ? 'synthetic@example.invalid' : '234567' } })).status, 200);
  results.push('email-verification-and-safe-failures');
} finally { if (previous === undefined) delete process.env.APP_URL; else process.env.APP_URL = previous; }

const ui = await build({ entryPoints: ['src/components/telegram-account-connection.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic' });
const uiModule = { exports: {} };
vm.runInNewContext(ui.outputFiles[0].text, { module: uiModule, exports: uiModule.exports, require, console });
const Component = uiModule.exports.TelegramAccountConnection;
const markup = (state, locale = 'tr') => renderToStaticMarkup(React.createElement(Component, { accounts: state ? [{ ...account, status: state === 'READY' ? 'CONNECTED' : 'AUTHENTICATING', authState: state }] : [], locale, onAccountsChange() {}, async onRefresh() {} }));
for (const [state, expected] of Object.entries({ WAIT_PHONE_NUMBER: 'Telefon numarası', WAIT_CODE: 'Telegram doğrulama kodu', WAIT_PASSWORD: 'İki aşamalı doğrulama parolası', WAIT_EMAIL_ADDRESS: 'Doğrulama e-postası', WAIT_EMAIL_CODE: 'E-posta doğrulama kodu', WAIT_OTHER_DEVICE: 'yeni oturum açma isteğini onaylayın', READY: 'Sohbetleri eşitle', CLOSED: 'Bağlantıya devam et' })) assert.ok(markup(state).includes(expected), state);
assert.ok(markup(null).includes('Telegram hesabı bağla'));
assert.ok(markup('WAIT_PASSWORD').includes('type="password"'));
const uz = markup('WAIT_PHONE_NUMBER', 'uz');
assert.ok(uz.includes('+998'));
assert.ok(uz.includes('value="UZ" selected=""'));
for (const code of ['+966', '+963', '+964', '+971']) assert.ok(uz.includes(code));
results.push('render-all-auth-states-empty-existing-connected-and-country-defaults');
console.log(JSON.stringify({ ok: true, externalProviderCalled: false, productionDataUsed: false, results }, null, 2));
