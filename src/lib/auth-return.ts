export const SUBSCRIPTION_HREF = "/settings/subscriptions";
/** Accept only local routes, including after decoding. Reject auth loops. */
export function safeAuthReturn(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || value.length > 2048) return fallback;
  try {
    if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/u.test(value)) return fallback;
    const url = new URL(value, "https://logivya.com");
    let decodedPath = url.pathname;
    for (let i=0;i<3;i++) decodedPath = decodeURIComponent(decodedPath);
    if (url.origin !== "https://logivya.com" || decodedPath.startsWith("//") || /[\\\u0000-\u0020?#]/u.test(decodedPath) || /^\/(login|register|logout|api)(\/|$)/u.test(decodedPath)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}
export function authHref(mode: "login" | "register", returnTo: string) {
  return `/${mode}?returnTo=${encodeURIComponent(safeAuthReturn(returnTo))}`;
}
