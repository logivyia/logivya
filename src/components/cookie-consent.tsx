"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";

import { useI18n } from "@/i18n/provider";
import { defaultBrowserPrivacyPreferences, readBrowserPrivacyPreferences, saveBrowserPrivacyPreferences, type BrowserPrivacyPreferences } from "@/lib/privacy-preferences";

export function CookieConsent() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [preferences, setPreferences] = useState<BrowserPrivacyPreferences>(defaultBrowserPrivacyPreferences);
  useEffect(() => {
    const existing = readBrowserPrivacyPreferences();
    if (existing) setPreferences(existing);
    else setOpen(true);
    const reopen = () => { setManage(true); setOpen(true); };
    window.addEventListener("logivya:open-cookie-preferences", reopen);
    return () => window.removeEventListener("logivya:open-cookie-preferences", reopen);
  }, []);

  function save(value: BrowserPrivacyPreferences) {
    saveBrowserPrivacyPreferences(value);
    setPreferences(value);
    setOpen(false);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-3xl rounded-lg border bg-card p-5 text-card-foreground shadow-2xl">
      <h2 className="font-semibold">{t("cookies.title")}</h2>
      <p className="mt-2 text-sm text-muted">{t("cookies.description")}</p>
      {manage ? <div className="mt-4 grid gap-3 text-sm"><label><input checked disabled type="checkbox" className="me-2 size-4 accent-primary" />{t("cookies.essential")}</label><label><input checked={preferences.functional} onChange={(event) => setPreferences((value) => ({ ...value, functional: event.target.checked }))} type="checkbox" className="me-2 size-4 accent-primary" />{t("cookies.functional")}</label><label><input checked={preferences.analytics} onChange={(event) => setPreferences((value) => ({ ...value, analytics: event.target.checked }))} type="checkbox" className="me-2 size-4 accent-primary" />{t("cookies.analytics")}</label><label><input checked={preferences.marketing} onChange={(event) => setPreferences((value) => ({ ...value, marketing: event.target.checked }))} type="checkbox" className="me-2 size-4 accent-primary" />{t("cookies.marketing")}</label></div> : null}
      <div className="mt-4 grid gap-2 sm:grid-cols-3"><button onClick={() => save({ ...preferences, functional: true, analytics: true, marketing: true })} className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">{t("cookies.acceptAll")}</button><button onClick={() => save({ ...preferences, functional: false, analytics: false, marketing: false })} className="min-h-11 rounded-lg border border-primary px-4 py-2 text-sm font-semibold">{t("cookies.rejectOptional")}</button><button onClick={() => manage ? save(preferences) : setManage(true)} className="min-h-11 rounded-lg border px-4 py-2 text-sm">{manage ? t("cookies.save") : t("cookies.manage")}</button></div>
    </div>
  );
}
