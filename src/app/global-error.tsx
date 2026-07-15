"use client";

import { useEffect } from "react";
import { reportClientError } from "@/client/observability/report-client-error";

const ERROR_COPY = {
  tr: { title: "Sayfa yüklenemedi", retry: "Tekrar dene" },
  en: { title: "The page could not be loaded", retry: "Try again" },
} as const;

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const language = typeof navigator === "undefined" ? "tr" : navigator.language.toLowerCase();
  const copy = language.startsWith("tr") ? ERROR_COPY.tr : ERROR_COPY.en;

  useEffect(() => {
    reportClientError({ digest: error.digest, name: error.name, source: "global-boundary" });
  }, [error]);

  return (
    <html lang="tr">
      <body style={{ margin: 0, background: "#071323", color: "#f8fafc", fontFamily: "Arial, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <section style={{ width: "min(100%, 480px)", textAlign: "center" }}>
            <h1 style={{ fontSize: 24, margin: 0 }}>{copy.title}</h1>
            {error.digest ? <p style={{ opacity: 0.7, fontFamily: "monospace" }}>#{error.digest}</p> : null}
            <button
              type="button"
              onClick={unstable_retry}
              style={{ marginTop: 20, minHeight: 44, border: 0, borderRadius: 6, padding: "0 20px", background: "#ff7a1a", color: "#071323", fontWeight: 700 }}
            >
              {copy.retry}
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
