"use client";

import { useEffect } from "react";
import { reportClientError } from "@/client/observability/report-client-error";
import { useI18n } from "@/i18n/provider";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    reportClientError({ digest: error.digest, name: error.name, source: "segment-boundary" });
  }, [error]);

  return (
    <div className="panel rounded-2xl p-8 text-center">
      <h2 className="text-xl font-semibold">{t("errors.pageLoadFailed")}</h2>
      {error.digest ? <p className="mt-2 font-mono text-xs text-muted">#{error.digest}</p> : null}
      <button onClick={unstable_retry} className="mt-5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">
        {t("errors.tryAgain")}
      </button>
    </div>
  );
}
