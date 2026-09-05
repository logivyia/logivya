"use client";

import Link from "next/link";
import { type ReactNode, useMemo, useSyncExternalStore } from "react";

const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "ref",
  "referral",
] as const;

function subscribeToLocationChange(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function getLocationSearch() {
  return window.location.search;
}

function getServerLocationSearch() {
  return "";
}

export function PublicAttributionLink({
  destination,
  className,
  ariaLabel,
  children,
}: {
  destination: "/login" | "/register";
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const locationSearch = useSyncExternalStore(
    subscribeToLocationChange,
    getLocationSearch,
    getServerLocationSearch,
  );
  const href = useMemo<string>(() => {
    const source = new URLSearchParams(locationSearch);
    const attribution = new URLSearchParams();
    for (const key of ATTRIBUTION_KEYS) {
      const value = source.get(key)?.trim();
      if (value) attribution.set(key, value.slice(0, 256));
    }
    const query = attribution.toString();
    return query ? `${destination}?${query}` : destination;
  }, [destination, locationSearch]);

  return <Link href={href} className={className} aria-label={ariaLabel}>{children}</Link>;
}
