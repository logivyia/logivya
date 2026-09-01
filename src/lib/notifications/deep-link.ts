const LOGIVYA_WEB_ORIGIN = "https://logivya.com";

/** Maps provider/mobile notification destinations to a safe authenticated web route. */
export function notificationDeepLinkToWebHref(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\/(?!\/)/u.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.protocol === "https:" && /(^|\.)logivya\.com$/iu.test(url.hostname)) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
    if (url.protocol !== "logivya:") return null;

    const mobilePath = `${url.hostname}${url.pathname}`.replace(/^\/+|\/+$/gu, "");
    const listing = mobilePath.match(/^marketplace\/(loads|vehicles|drivers)\/([^/]+)$/u);
    if (listing) {
      return `/marketplace/listings/${listing[1]}/${encodeURIComponent(decodeURIComponent(listing[2]))}${url.search}`;
    }
    if (mobilePath === "marketplace") return `/marketplace${url.search}`;
    if (mobilePath === "marketplace/requests" || mobilePath === "demand-requests") return `/marketplace/requests${url.search}`;
    if (mobilePath === "whatsapp" || mobilePath === "whatsapp/accounts") return "/accounts";
    if (mobilePath === "telegram" || mobilePath === "telegram/accounts") return "/telegram";
    if (mobilePath === "facebook" || mobilePath === "facebook/pages") return "/facebook";
  } catch {
    return null;
  }

  return null;
}

export function absoluteLogivyaWebUrl(href: string) {
  return new URL(href, LOGIVYA_WEB_ORIGIN).toString();
}
