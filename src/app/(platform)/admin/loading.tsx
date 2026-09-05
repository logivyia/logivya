import { getServerTranslator } from "@/i18n/server";

export default async function AdminLoading() {
  const { t } = await getServerTranslator();
  return <div role="status" aria-label={t("common.loading")} className="space-y-6 motion-safe:animate-pulse">
    <div className="h-8 w-56 rounded-xl bg-slate-200" />
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map(key => <div key={key} className="h-32 rounded-2xl border bg-white" />)}</div>
    <div className="h-72 rounded-2xl border bg-white" />
  </div>;
}
