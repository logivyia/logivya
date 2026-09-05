import type { NotificationAdminTab } from "@/api/mobileNotificationAdmin";

const notificationAdminTabs = new Set<NotificationAdminTab>([
  "dashboard",
  "events",
  "deliveries",
  "deadLetters",
  "templates",
  "announcements",
  "providers",
]);

export function parseNotificationAdminTab(value: string): NotificationAdminTab {
  return notificationAdminTabs.has(value as NotificationAdminTab)
    ? (value as NotificationAdminTab)
    : "dashboard";
}

export function normalizeAdminNotificationPath(path: string) {
  const [pathname = "", query = ""] = path.split("?", 2);
  const normalizedPathname = pathname.replace(/^\/+|\/+$/g, "");

  if (normalizedPathname === "admin/announcements") {
    return `profile/admin/notifications/announcements${query ? `?${query}` : ""}`;
  }

  if (
    normalizedPathname === "admin/notifications" ||
    normalizedPathname.startsWith("admin/notifications/")
  ) {
    return `profile/${normalizedPathname}${query ? `?${query}` : ""}`;
  }

  return path;
}

export const adminNotificationOperationsLinking = {
  path: "admin/notifications/:initialTab?",
  alias: [
    {
      path: "admin/notifications/:initialTab?",
      exact: true,
    },
  ],
  parse: {
    initialTab: parseNotificationAdminTab,
  },
};
