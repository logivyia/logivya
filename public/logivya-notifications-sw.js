self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = typeof payload.title === "string" ? payload.title : "Logivya";
  const body = typeof payload.message === "string" ? payload.message : "Yeni bir bildiriminiz var.";
  const deepLink = toWebDeepLink(payload.deepLink);
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/favicon-192x192.png",
    badge: "/favicon-192x192.png",
    tag: typeof payload.type === "string" ? payload.type : "logivya-notification",
    renotify: false,
    data: { deepLink },
  }));
});

function toWebDeepLink(value) {
  if (typeof value !== "string") return "/notifications";
  if (/^\/(?!\/)/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && /(^|\.)logivya\.com$/i.test(url.hostname)) return `${url.pathname}${url.search}${url.hash}`;
    if (url.protocol !== "logivya:") return "/notifications";
    const path = `${url.hostname}${url.pathname}`.replace(/^\/+|\/+$/g, "");
    const listing = path.match(/^marketplace\/(loads|vehicles|drivers)\/([^/]+)$/);
    if (listing) return `/marketplace/listings/${listing[1]}/${encodeURIComponent(decodeURIComponent(listing[2]))}${url.search}`;
    if (path === "marketplace") return `/marketplace${url.search}`;
    if (path === "marketplace/requests" || path === "demand-requests") return `/marketplace/requests${url.search}`;
  } catch {
    return "/notifications";
  }
  return "/notifications";
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const deepLink = event.notification.data && typeof event.notification.data.deepLink === "string"
    ? event.notification.data.deepLink
    : "/notifications";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    for (const client of windows) {
      if ("focus" in client) {
        client.navigate(deepLink);
        return client.focus();
      }
    }
    return clients.openWindow(deepLink);
  }));
});
