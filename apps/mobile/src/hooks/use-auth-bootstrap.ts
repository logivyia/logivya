import { useEffect } from "react";

import { useAuthStore } from "@/auth/auth-store";
import { restoreSession } from "@/auth/auth-service";
import { captureAppError } from "@/services/crash-reporting";

export function useAuthBootstrap() {
  useEffect(() => {
    restoreSession().catch((error) => {
      captureAppError(error, { source: "auth-bootstrap" });
      useAuthStore.getState().clearSession();
    });
  }, []);
}
