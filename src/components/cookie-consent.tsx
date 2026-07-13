"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";

import { useI18n } from "@/i18n/provider";

export function CookieConsent() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);
  useEffect(() => setOpen(!localStorage.getItem("logivya.cookie-consent")), []);

  function save(value: string) {
    localStorage.setItem("logivya.cookie-consent", value);
    setOpen(false);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-3xl rounded-2xl border bg-white p-5 shadow-2xl">
      <h2 className="font-semibold">{t("cookies.title")}</h2>
      <p className="mt-2 text-sm text-muted">{t("cookies.description")}</p>
      {manage ? <div className="mt-4 grid gap-2 text-sm"><label><input checked disabled type="checkbox" className="me-2" />{t("cookies.essential")}</label><label><input name="analytics" type="checkbox" className="me-2" />{t("cookies.analytics")}</label><label><input name="marketing" type="checkbox" className="me-2" />{t("cookies.marketing")}</label></div> : null}
      <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => save("all")} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">{t("cookies.acceptAll")}</button><button onClick={() => save("essential")} className="rounded-xl border px-4 py-2 text-sm">{t("cookies.rejectOptional")}</button><button onClick={() => setManage((value) => !value)} className="rounded-xl border px-4 py-2 text-sm">{t("cookies.manage")}</button></div>
    </div>
  );
}
