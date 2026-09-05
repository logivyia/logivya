type NotificationResponseIdentity = {
  actionIdentifier: string;
  notification: {
    request: {
      identifier: string;
    };
  };
};

export function notificationResponseKey(response: NotificationResponseIdentity) {
  const identifier = response.notification.request.identifier.trim();
  if (!identifier) return null;
  return `${identifier}:${response.actionIdentifier.trim() || "default"}`;
}

export function createNotificationResponseDeduper(limit = 64) {
  const handled = new Set<string>();
  const boundedLimit = Math.max(1, limit);

  return {
    shouldHandle(response: NotificationResponseIdentity) {
      const key = notificationResponseKey(response);
      if (!key) return true;
      if (handled.has(key)) return false;

      handled.add(key);
      while (handled.size > boundedLimit) {
        const oldest = handled.values().next().value;
        if (typeof oldest !== "string") break;
        handled.delete(oldest);
      }
      return true;
    },
  };
}
