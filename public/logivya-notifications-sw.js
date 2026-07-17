self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = typeof payload.title === "string" ? payload.title : "Logivya";
  const body = typeof payload.message === "string" ? payload.message : "Yeni bir bildiriminiz var.";
  const deepLink = typeof payload.deepLink === "string" && payload.deepLink.startsWith("/") ? payload.deepLink : "/notifications";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/favicon-192x192.png",
    badge: "/favicon-192x192.png",
    tag: typeof payload.type === "string" ? payload.type : "logivya-notification",
    renotify: false,
    data: { deepLink },
  }));
});

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
