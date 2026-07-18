import { useEffect } from "react";

import { useAuthStore } from "@/auth/auth-store";
import { restoreSession } from "@/auth/auth-service";
import { captureAppError } from "@/services/crash-reporting";

const bootstrapRetryDelaysMs = [0, 1_000, 2_500];

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function useAuthBootstrap() {
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      for (const delayMs of bootstrapRetryDelaysMs) {
        if (delayMs) await wait(delayMs);
        if (cancelled) return;
        try {
          await restoreSession();
          return;
        } catch (error) {
          captureAppError(error, { source: "auth-bootstrap", retryDelayMs: delayMs });
        }
      }
      if (!cancelled) useAuthStore.getState().setRecovering();
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);
}
