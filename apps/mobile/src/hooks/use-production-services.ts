import { useEffect } from "react";
import * as Linking from "expo-linking";

import { useAuthStore } from "@/auth/auth-store";
import { requestNotificationPermissionAndRegister, subscribeNotificationHandlers } from "@/services/notifications";
import { captureAppError, setCrashUser } from "@/services/crash-reporting";
import { trackEvent } from "@/services/analytics";

export function useProductionServices() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    setCrashUser(user ? { id: user.id, email: user.email } : null);
  }, [user]);

  useEffect(() => {
    return subscribeNotificationHandlers((url) => {
      void Linking.openURL(url);
    });
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    requestNotificationPermissionAndRegister().catch((error) => {
      captureAppError(error, { source: "push-registration" });
    });
    void trackEvent("mobile_session_authenticated");
  }, [status]);
}
