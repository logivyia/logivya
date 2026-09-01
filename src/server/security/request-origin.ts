/** Shared web-CSRF boundary. Proxy headers are not an origin allowlist. */
export function isMutationRequest(request: Pick<Request, "method">) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase());
}

function parseOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

function trustedOrigins(request: Request) {
  const configured = [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    ...(process.env.CSRF_TRUSTED_ORIGINS || "").split(","),
  ].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  if (!configured.length && process.env.NODE_ENV !== "production") {
    return new Set([new URL(request.url).origin]);
  }
  const origins = configured.map(parseOrigin);
  // A missing/broken deployment allowlist must never fall back to attacker headers.
  if (origins.some((origin) => !origin || (process.env.NODE_ENV === "production" && !origin.startsWith("https://")))) {
    return new Set<string>();
  }
  return new Set(origins.filter((origin): origin is string => origin !== null));
}

export function assertTrustedRequestOrigin(request: Request) {
  const origin = parseOrigin(request.headers.get("origin") || "");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site" || !trustedOrigins(request).has(origin)) {
    throw new Error("CSRF_REJECTED");
  }
}

export function assertWebMutationOrigin(request: Request) {
  if (isMutationRequest(request)) assertTrustedRequestOrigin(request);
}
