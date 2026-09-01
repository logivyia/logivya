import { isClientDiagnosticsAllowed } from "@/lib/client-observability-consent";

type ClientErrorReport = {
  digest?: string;
  name?: string;
  source: "segment-boundary" | "global-boundary" | "window-error" | "unhandled-rejection";
};

export function reportClientError(report: ClientErrorReport) {
  if (typeof window === "undefined") return;
  if (!isClientDiagnosticsAllowed()) return;
  const payload = {
    ...report,
    route: window.location.pathname,
    platform: "web",
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION || "unknown",
  };
  void fetch("/api/observability/client-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined);
}
