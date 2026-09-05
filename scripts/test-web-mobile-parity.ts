import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const passwordInput = read("src/components/password-input.tsx");
const authForm = read("src/components/auth-form.tsx");
const passwordReset = read("src/components/password-reset-form.tsx");
const securitySettings = read("src/components/security-settings-page.tsx");
const socialButtons = read("src/components/social-login-buttons.tsx");
const socialRoute = read("src/app/api/auth/social/route.ts");
const socialIdentity = read("src/server/auth/social-identity.ts");
const accountsPage = read("src/components/feature-pages.tsx");
const webObservability = read("src/components/web-observability.tsx");
const webVitalsRoute = read("src/app/api/observability/web-vitals/route.ts");
const clientErrorReporter = read("src/client/observability/report-client-error.ts");
const appShell = read("src/components/app-shell.tsx");
const onboarding = read("src/components/operations-pages.tsx");
const onboardingRoute = read("src/app/(platform)/onboarding/page.tsx");

assert.match(passwordInput, /type=\{visible \? "text" : "password"\}/);
assert.match(passwordInput, /aria-pressed=\{visible\}/);
assert.match(authForm, /<PasswordInput/);
assert.match(passwordReset, /<PasswordInput/);
assert.match(securitySettings, /<PasswordInput/);

assert.match(authForm, /<SocialLoginButtons/);
assert.match(socialButtons, /accounts\.google\.com\/gsi\/client/);
assert.match(socialButtons, /appleid\.cdn-apple\.com/);
assert.match(socialButtons, /id="appleid-signin"/);
assert.match(socialButtons, /data-type="continue"/);
assert.match(socialButtons, /data-mode="center-align"/);
assert.match(socialButtons, /AppleIDSignInOnSuccess/);
assert.doesNotMatch(socialButtons, /import \{ Apple,/);
assert.match(socialIdentity, /GOOGLE_WEB_OAUTH_CLIENT_ID/);
assert.match(socialIdentity, /APPLE_WEB_CLIENT_ID/);
assert.match(socialRoute, /verifySocialIdentity/);
assert.match(socialRoute, /resolvePreferredLoginMembership/);
assert.match(socialRoute, /resolveMfaLoginDecision/);
assert.match(socialRoute, /validateTrustedDevice/);
assert.match(socialRoute, /createSession/);
assert.doesNotMatch(socialRoute, /workspace\.create|company\.create/);

assert.match(accountsPage, /refreshDirectory\(accountId: string, kind: "groups" \| "contacts"\)/);
assert.match(accountsPage, /\/sync-groups/);
assert.match(accountsPage, /\/api\/whatsapp\/contacts\/sync-current/);
assert.match(accountsPage, /accounts\.refreshGroups/);
assert.match(accountsPage, /accounts\.refreshContacts/);

assert.match(webObservability, /useReportWebVitals/);
assert.match(webObservability, /PRODUCT_ANALYTICS/);
assert.match(webObservability, /CRASH_DIAGNOSTICS/);
assert.match(webObservability, /browser\?\.analytics === true/);
assert.match(webVitalsRoute, /TTFB/);
assert.match(webVitalsRoute, /LCP/);
assert.match(webVitalsRoute, /INP/);
assert.match(webVitalsRoute, /maxAttempts: 120/);
assert.match(clientErrorReporter, /isClientDiagnosticsAllowed/);

assert.doesNotMatch(appShell, /"\/onboarding"/, "The final simplified primary menu must not regain a standalone onboarding item.");
assert.match(onboardingRoute, /OnboardingPage/, "The existing onboarding route must remain bookmark-compatible.");
assert.match(onboarding, /onboarding\.guideConnectTitle/);
assert.match(onboarding, /onboarding\.guideOrganizeTitle/);
assert.match(onboarding, /onboarding\.guideControlTitle/);

console.log("Web/mobile product parity contracts passed.");
