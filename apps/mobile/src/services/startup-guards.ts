import { captureAppError } from "@/services/crash-reporting";

type ErrorUtilsLike = {
  getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
  setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
};

type RejectionEventLike = {
  reason?: unknown;
};

declare const global: typeof globalThis & {
  ErrorUtils?: ErrorUtilsLike;
  addEventListener?: (type: string, listener: (event: RejectionEventLike) => void) => void;
};

let installed = false;

function toError(error: unknown) {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" ? error : "Unknown startup error");
}

export function installGlobalStartupGuards() {
  if (installed) return;
  installed = true;

  try {
    const previousHandler = global.ErrorUtils?.getGlobalHandler?.();
    global.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
      captureAppError(error, { source: "global-error-handler", isFatal: Boolean(isFatal) });
      previousHandler?.(error, isFatal);
    });
  } catch {
    // The guard itself must never be allowed to crash startup.
  }

  try {
    global.addEventListener?.("unhandledrejection", (event) => {
      captureAppError(toError(event.reason), { source: "global-unhandled-rejection" });
    });
  } catch {
    // Some React Native runtimes do not expose addEventListener on global.
  }
}
