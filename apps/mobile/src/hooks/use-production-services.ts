import { useEffect } from "react";
import * as Linking from "expo-linking";

import { useAuthStore } from "@/auth/auth-store";
import { captureAppError, setCrashUser } from "@/services/crash-reporting";
import { trackEvent } from "@/services/analytics";

export function useProductionServices() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    setCrashUser(user ? { id: user.id } : null);
  }, [user]);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    import("@/services/notifications")
      .then(({ configureNotificationRuntime, subscribeNotificationHandlers }) => {
        if (!isMounted) return;
        configureNotificationRuntime();
        unsubscribe = subscribeNotificationHandlers((url) => {
          Linking.openURL(url).catch((error) => {
            captureAppError(error, { source: "notification-deep-link", url });
          });
        });
      })
      .catch((error) => {
        captureAppError(error, { source: "notification-runtime-load" });
      });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    import("@/services/notifications")
      .then(({ requestNotificationPermissionAndRegister }) => requestNotificationPermissionAndRegister())
      .catch((error) => {
        captureAppError(error, { source: "push-registration" });
      });
    void trackEvent("mobile_session_authenticated");
  }, [status]);
}
