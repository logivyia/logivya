"use client";

import { useEffect } from "react";
import { reportClientError } from "@/client/observability/report-client-error";

export function WebObservability() {
  useEffect(() => {
    const recent = new Map<string, number>();
    const reportOnce = (source: "window-error" | "unhandled-rejection", name: string) => {
      const key = `${source}:${name}`;
      const now = Date.now();
      if (now - (recent.get(key) ?? 0) < 30_000) return;
      recent.set(key, now);
      reportClientError({ source, name: name.slice(0, 80) });
    };
    const onError = (event: ErrorEvent) => reportOnce("window-error", event.error instanceof Error ? event.error.name : "WindowError");
    const onRejection = (event: PromiseRejectionEvent) => reportOnce("unhandled-rejection", event.reason instanceof Error ? event.reason.name : "UnhandledRejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      recent.clear();
    };
  }, []);
  return null;
}
