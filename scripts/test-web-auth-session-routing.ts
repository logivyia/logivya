import { NextRequest } from "next/server";

import { proxy } from "../src/proxy";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const staleLogin = proxy(new NextRequest("https://www.logivya.com/login", {
  headers: { cookie: "logivya_session=expired-or-revoked" },
}));
assert(!staleLogin.headers.get("location"), "A stale session cookie must never redirect /login back to /dashboard.");
assert(staleLogin.headers.get("x-middleware-next") === "1", "The login route must reach backend session validation.");

const anonymousDashboard = proxy(new NextRequest("https://www.logivya.com/dashboard"));
assert(anonymousDashboard.status === 307, "Anonymous dashboard access must redirect.");
assert(anonymousDashboard.headers.get("location") === "https://www.logivya.com/login", "Anonymous dashboard access must redirect to /login.");

const cookieDashboard = proxy(new NextRequest("https://www.logivya.com/dashboard", {
  headers: { cookie: "logivya_session=backend-must-validate-this" },
}));
assert(!cookieDashboard.headers.get("location"), "A session cookie on a protected route must reach requireSession for authoritative validation.");

console.log("Web auth routing passed: stale cookies cannot create a login/dashboard redirect loop.");
