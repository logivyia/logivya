"use client";

import { marketplaceCopy } from "@/components/marketplace/copy";
import { useI18n } from "@/i18n/provider";

export default function Loading() {
  const { locale } = useI18n();
  const copy = marketplaceCopy(locale);
  return (
    <div className="space-y-5" aria-busy="true" aria-label={copy.loading}>
      <div className="h-56 animate-pulse rounded-3xl border bg-card motion-reduce:animate-none" />
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="h-80 animate-pulse rounded-2xl border bg-card motion-reduce:animate-none" />)}
      </div>
    </div>
  );
}
