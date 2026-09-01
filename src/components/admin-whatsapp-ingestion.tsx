"use client";

import { AlertTriangle, CheckCircle2, PauseCircle, PlayCircle, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useI18n } from "@/i18n/provider";

type Group = {
  id: string;
  name: string;
  externalGroupId: string;
  participantCount: number;
  lastSyncedAt: string;
  lastInboundMessageAt: string | null;
  lastPublishedListingAt: string | null;
  processedMessageCount: number;
  publishedListingCount: number;
  failedMessageCount: number;
  ingestionEnabled: boolean;
  ingestionApprovedAt: string | null;
  logisticsGroupRecommended: boolean;
  logisticsRecommendationConfidence: number | null;
  autoPublicationEnabled: boolean;
  manualReviewRequired: boolean;
  minimumConfidence: number;
  sectorHint: "GENERAL_LOGISTICS" | "HOME_MOVING" | "PARTIAL_LOAD" | "HEAVY_HAUL" | "MIXED" | "UNKNOWN";
  ingestionPausedAt: string | null;
  account: { id: string; status: string; lastConnectedAt: string | null; lastHeartbeatAt: string | null };
};

type Health = {
  control: { globallyPaused: boolean; emergencyKillSwitch: boolean; pauseReason: string | null } | null;
  connectedAccounts: number;
  activeGroups: number;
  messagesLastHour: number;
  logisticsListings: number;
  autoPublished: number;
  pendingReview: number;
  duplicates: number;
  failedAiRequests: number;
  failedJobs: number;
  deadLetterCount: number;
  generatedMatches: number;
  notificationDeliverySuccessRate: number | null;
  staleConnectionAlerts: number;
  queueLagMs: number;
  averageProcessingLatencyMs: number | null;
  p95ProcessingLatencyMs: number | null;
  worker: { healthy: boolean; status: string; workerId: string | null; currentJobs: number; capacity: number; lastHeartbeatAt: string | null; lastSuccessfulEventAt: string | null };
  lastSuccessfulEventAt: string | null;
  lastReconnectAt: string | null;
};

type Review = {
  id: string;
  listingType: string;
  title: string | null;
  routeDescription: string | null;
  confidenceScore: number;
  missingCriticalFields: string[];
  reviewStatus: string;
  createdAt: string;
  inboundMessage: { sourceMessageTimestamp: string; group: { id: string; name: string } };
};

type ReviewDetail = Review & {
  normalizedDescription: string | null;
  originCity: string | null;
  destinationCity: string | null;
  cargoType: string | null;
  tonnageMin: string | number | null;
  tonnageMax: string | number | null;
  trailerType: string | null;
  loadingDate: string | null;
  freightAmount: string | number | null;
  freightCurrency: string | null;
  publicContactPhone: string | null;
  rawMessage: string | null;
  structuredData: Record<string, unknown>;
  sectorClassification: ReviewSector;
  marketplaceScopes: ReviewScope[];
  sectorConfidenceScore: number | null;
  sectorEvidence: Record<string, unknown> | null;
  similar: Array<{ id: string; reviewStatus: string; createdAt: string }>;
};

type ReviewSector = "GENERAL_LOGISTICS" | "HOME_MOVING" | "PARTIAL_LOAD" | "HEAVY_HAUL" | "MULTI_SECTOR";
type ReviewScope = "GLOBAL" | "HOME_MOVING" | "PARTIAL_LOAD" | "HEAVY_HAUL";

type ReviewDraft = {
  primarySector: ReviewSector;
  marketplaceScopes: ReviewScope[];
  title: string;
  normalizedDescription: string;
  originCity: string;
  destinationCity: string;
  cargoType: string;
  tonnageMin: string;
  tonnageMax: string;
  trailerType: string;
  loadingDate: string;
  freightAmount: string;
  freightCurrency: string;
  publicContactPhone: string;
  driverListingType: string;
  driverLicenseClasses: string;
  driverExperienceYears: string;
  driverEmploymentType: string;
  driverInternationalExperience: boolean;
  driverAdrCertificate: boolean;
  driverSrcCertificate: boolean;
  driverPsychotechnicalCertificate: boolean;
};

export function AdminWhatsAppIngestion({ initialGroups, initialHealth, initialReview }: { initialGroups: Group[]; initialHealth: Health; initialReview: Review[] }) {
  const [groups, setGroups] = useState(initialGroups);
  const [health, setHealth] = useState(initialHealth);
  const [review, setReview] = useState(initialReview);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [enabledFilter, setEnabledFilter] = useState<"ALL" | "ENABLED" | "DISABLED">("ALL");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const { locale } = useI18n();
  const copy = adminWhatsAppCopy[locale === "tr" ? "tr" : "en"];

  const filtered = useMemo(() => groups.filter((group) => {
    if (enabledFilter === "ENABLED" && !group.ingestionEnabled) return false;
    if (enabledFilter === "DISABLED" && group.ingestionEnabled) return false;
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return !needle || group.name.toLocaleLowerCase("tr-TR").includes(needle) || group.externalGroupId.toLowerCase().includes(needle);
  }), [enabledFilter, groups, query]);

  async function refresh() {
    setBusy("refresh"); setError(null);
    try {
      const [groupPayload, healthPayload, reviewPayload] = await Promise.all([
        api<{ groups: Group[] }>("/api/admin/whatsapp-ingestion/groups?limit=200"),
        api<Health>("/api/admin/whatsapp-ingestion/health"),
        api<{ review: Review[] }>("/api/admin/whatsapp-ingestion/review?limit=50"),
      ]);
      setGroups(groupPayload.groups); setHealth(healthPayload); setReview(reviewPayload.review);
    } catch (requestError) { setError(message(requestError)); }
    finally { setBusy(null); }
  }

  async function mutateGroup(group: Group, patch: Record<string, unknown>) {
    const reason = window.prompt(copy.changeReasonPrompt);
    if (!reason || reason.trim().length < 5) return;
    setBusy(group.id); setError(null);
    try {
      const payload = await api<{ group: Group }>(`/api/admin/whatsapp-ingestion/groups/${group.id}`, { method: "PATCH", body: JSON.stringify({ ...patch, reason }) });
      setGroups((current) => current.map((item) => item.id === group.id ? payload.group : item));
    } catch (requestError) { setError(message(requestError)); }
    finally { setBusy(null); }
  }

  async function bulk(enabled: boolean) {
    const ids = [...selected];
    if (!ids.length) return;
    if (enabled && !window.confirm(copy.bulkApprovalConfirm)) return;
    const reason = window.prompt(copy.bulkReasonPrompt);
    if (!reason || reason.trim().length < 5) return;
    setBusy("bulk"); setError(null);
    try {
      await api(`/api/admin/whatsapp-ingestion/groups/bulk-${enabled ? "enable" : "disable"}`, { method: "POST", body: JSON.stringify({ ids, reason, ...(enabled ? { approvalConfirmed: true } : {}) }) });
      setSelected(new Set()); await refresh();
    } catch (requestError) { setError(message(requestError)); setBusy(null); }
  }

  async function setGlobalState(action: "pause" | "resume", emergency = false) {
    const reason = window.prompt(action === "pause" ? copy.pauseReasonPrompt : copy.resumeReasonPrompt);
    if (!reason || reason.trim().length < 5) return;
    if (emergency && !window.confirm(copy.emergencyConfirm)) return;
    setBusy(action); setError(null);
    try {
      const payload = await api<{ control: Health["control"] }>(`/api/admin/whatsapp-ingestion/${action}`, { method: "POST", body: JSON.stringify(action === "pause" ? { reason, emergency } : { reason }) });
      setHealth((current) => ({ ...current, control: payload.control }));
    } catch (requestError) { setError(message(requestError)); }
    finally { setBusy(null); }
  }

  async function openReview(id: string) {
    setBusy(id); setError(null);
    try {
      const payload = await api<{ review: ReviewDetail }>(`/api/admin/whatsapp-ingestion/review/${id}`);
      setDetail(payload.review);
      setReviewDraft(toReviewDraft(payload.review));
    }
    catch (requestError) { setError(message(requestError)); }
    finally { setBusy(null); }
  }

  async function reviewAction(action: "publish" | "reject" | "duplicate") {
    if (!detail) return;
    const reason = window.prompt(copy.actionReason(action));
    if (!reason || reason.trim().length < 5) return;
    setBusy(detail.id); setError(null);
    try {
      const fields = action === "publish" ? publicationFields(reviewDraft, detail.listingType === "DRIVER") : {};
      await api(`/api/admin/whatsapp-ingestion/review/${detail.id}/${action}`, { method: "POST", body: JSON.stringify({ reason, ...fields }) });
      setDetail(null); setReviewDraft(null); await refresh();
    } catch (requestError) { setError(message(requestError)); setBusy(null); }
  }

  async function pauseReviewSource() {
    if (!detail) return;
    const group = groups.find((item) => item.id === detail.inboundMessage.group.id);
    if (!group || group.ingestionPausedAt) return;
    await mutateGroup(group, { paused: true });
  }

  function updateReviewDraft(field: keyof ReviewDraft, value: string) {
    setReviewDraft((current) => current ? { ...current, [field]: value } : current);
  }

  function updateReviewBoolean(field: "driverInternationalExperience" | "driverAdrCertificate" | "driverSrcCertificate" | "driverPsychotechnicalCertificate", value: boolean) {
    setReviewDraft((current) => current ? { ...current, [field]: value } : current);
  }

  function updateReviewSector(primarySector: ReviewSector) {
    setReviewDraft((current) => current ? {
      ...current,
      primarySector,
      marketplaceScopes: scopesForReviewSector(primarySector, current.marketplaceScopes),
    } : current);
  }

  function updateReviewScope(scope: ReviewScope, checked: boolean) {
    if (scope === "GLOBAL") return;
    setReviewDraft((current) => current ? {
      ...current,
      marketplaceScopes: checked
        ? [...new Set<ReviewScope>([...current.marketplaceScopes, scope])]
        : current.marketplaceScopes.filter((value) => value !== scope),
    } : current);
  }

  const paused = health.control?.globallyPaused || health.control?.emergencyKillSwitch;
  return <div className="space-y-6">
    <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-orange-600">{copy.eyebrow}</p><h1 className="mt-2 text-3xl font-semibold">{copy.title}</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">{copy.description}</p></div>
      <div className="flex flex-wrap gap-2"><button className="adminButton" disabled={Boolean(busy)} onClick={() => void refresh()}><RefreshCw className="size-4" /> {copy.refresh}</button>{paused ? <button className="adminButtonSuccess" disabled={Boolean(busy)} onClick={() => void setGlobalState("resume")}><PlayCircle className="size-4" /> {copy.resume}</button> : <><button className="adminButton" disabled={Boolean(busy)} onClick={() => void setGlobalState("pause")}><PauseCircle className="size-4" /> {copy.pauseAll}</button><button className="adminButtonDanger" disabled={Boolean(busy)} onClick={() => void setGlobalState("pause", true)}><ShieldAlert className="size-4" /> {copy.emergencyStop}</button></>}</div>
    </header>
    {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle className="me-2 inline size-4" />{error}</div> : null}
    {paused ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800"><PauseCircle className="me-2 inline size-4" />{copy.paused} {health.control?.pauseReason || copy.pausedDescription}</div> : null}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[
      [copy.connectedAccounts, health.connectedAccounts], [copy.activeGroups, health.activeGroups], [copy.lastHourMessages, health.messagesLastHour], [copy.pendingReview, health.pendingReview], [copy.p95Latency, duration(health.p95ProcessingLatencyMs)], [copy.autoPublished, health.autoPublished], [copy.matches, health.generatedMatches], [copy.failedAiRequests, health.failedAiRequests], [copy.failedJobs, health.failedJobs], [copy.deadLetter, health.deadLetterCount], [copy.pushSuccess, health.notificationDeliverySuccessRate == null ? "-" : `%${health.notificationDeliverySuccessRate}`], [copy.workerHealth, health.worker.healthy ? `${copy.healthy} (${health.worker.currentJobs}/${health.worker.capacity})` : copy.offline], [copy.lastSuccessfulEvent, date(health.lastSuccessfulEventAt)], [copy.lastReconnect, date(health.lastReconnectAt)],
    ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div>
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center"><label className="flex flex-1 items-center gap-2 rounded-xl border px-3"><Search className="size-4 text-slate-400"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} className="w-full py-2.5 text-sm outline-none"/></label><select value={enabledFilter} onChange={(event) => setEnabledFilter(event.target.value as typeof enabledFilter)} className="rounded-xl border px-3 py-2.5 text-sm"><option value="ALL">{copy.allGroups}</option><option value="ENABLED">{copy.enabled}</option><option value="DISABLED">{copy.disabled}</option></select><button className="adminButtonSuccess" disabled={!selected.size || Boolean(busy)} onClick={() => void bulk(true)}>{copy.enableSelected}</button><button className="adminButton" disabled={!selected.size || Boolean(busy)} onClick={() => void bulk(false)}>{copy.disableSelected}</button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1380px] text-sm"><thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-3"><input type="checkbox" checked={Boolean(filtered.length) && filtered.every((group) => selected.has(group.id))} onChange={(event) => setSelected(event.target.checked ? new Set(filtered.map((group) => group.id)) : new Set())}/></th><th>{copy.groupJid}</th><th>{copy.connection}</th><th>{copy.participants}</th><th>{copy.lastMessage}</th><th>{copy.counts}</th><th>{copy.enabled}</th><th>{copy.automatic}</th><th>{copy.manualReview}</th><th>{copy.minimumConfidence}</th><th>{copy.sectorHint}</th><th>{copy.state}</th></tr></thead><tbody>{filtered.map((group) => <tr key={group.id} className="border-b align-top last:border-0"><td className="py-4"><input type="checkbox" checked={selected.has(group.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(group.id); else next.delete(group.id); return next; })}/></td><td className="py-4 pe-4"><b>{group.name}</b><code className="mt-1 block text-[11px] text-slate-400">{group.externalGroupId}</code>{group.logisticsGroupRecommended ? <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700">{copy.aiRecommendation} %{group.logisticsRecommendationConfidence ?? "-"}</span> : null}</td><td className="py-4"><span className={group.account.status === "CONNECTED" ? "text-emerald-600" : "text-red-600"}>{group.account.status}</span></td><td className="py-4">{group.participantCount}</td><td className="py-4">{date(group.lastInboundMessageAt)}</td><td className="py-4">{group.processedMessageCount} / {group.publishedListingCount} / <span className={group.failedMessageCount ? "text-red-600" : ""}>{group.failedMessageCount}</span></td><td className="py-4"><Toggle checked={group.ingestionEnabled} disabled={busy === group.id} label={copy.ingestion} onChange={() => void mutateGroup(group, { ingestionEnabled: !group.ingestionEnabled, ...(!group.ingestionApprovedAt && !group.ingestionEnabled ? { approvalConfirmed: true } : {}) })}/></td><td className="py-4"><Toggle checked={group.autoPublicationEnabled} disabled={busy === group.id} label={copy.automaticShort} onChange={() => void mutateGroup(group, { autoPublicationEnabled: !group.autoPublicationEnabled })}/></td><td className="py-4"><Toggle checked={group.manualReviewRequired} disabled={busy === group.id} label={copy.reviewShort} onChange={() => void mutateGroup(group, { manualReviewRequired: !group.manualReviewRequired })}/></td><td className="py-4"><input type="number" min={50} max={100} defaultValue={group.minimumConfidence} className="w-20 rounded-lg border px-2 py-1" onBlur={(event) => { const value=Number(event.target.value); if (value !== group.minimumConfidence) void mutateGroup(group, { minimumConfidence: value }); }}/></td><td className="py-4"><select value={group.sectorHint} disabled={busy === group.id} className="rounded-lg border px-2 py-1 text-xs" onChange={(event) => void mutateGroup(group, { sectorHint: event.target.value })}>{SECTOR_HINTS.map((value) => <option key={value} value={value}>{copy.sectorNames[value]}</option>)}</select></td><td className="py-4">{group.ingestionPausedAt ? <button className="text-emerald-700 underline" onClick={() => void mutateGroup(group, { paused: false })}>{copy.continueSource}</button> : <button className="text-amber-700 underline" onClick={() => void mutateGroup(group, { paused: true })}>{copy.pauseSource}</button>}</td></tr>)}</tbody></table>{!filtered.length ? <p className="py-10 text-center text-sm text-slate-500">{copy.noGroups}</p> : null}</div>
    </section>
    <section className="rounded-2xl border bg-white p-4 shadow-sm"><div className="mb-4"><h2 className="text-xl font-semibold">{copy.reviewQueue}</h2><p className="text-sm text-slate-500">{copy.reviewDescription}</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-3">{copy.listing}</th><th>{copy.sourceGroup}</th><th>{copy.confidence}</th><th>{copy.missingFields}</th><th>{copy.time}</th><th></th></tr></thead><tbody>{review.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="py-4"><b>{item.title || item.listingType}</b><small className="block text-slate-500">{item.routeDescription || copy.routeMissing}</small></td><td>{item.inboundMessage.group.name}</td><td>%{item.confidenceScore}</td><td>{item.missingCriticalFields.join(", ") || "-"}</td><td>{date(item.createdAt)}</td><td><button className="text-orange-600 underline" disabled={busy === item.id} onClick={() => void openReview(item.id)}>{copy.inspect}</button></td></tr>)}</tbody></table>{!review.length ? <p className="py-10 text-center text-sm text-slate-500"><CheckCircle2 className="me-2 inline size-4 text-emerald-600"/>{copy.noReview}</p> : null}</div></section>
    {detail && reviewDraft ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-orange-600">{detail.listingType} · %{detail.confidenceScore}</p><h2 className="mt-1 text-2xl font-semibold">{detail.title || copy.reviewTitle}</h2><p className="mt-1 text-xs text-slate-500">{detail.inboundMessage.group.name} · {date(detail.inboundMessage.sourceMessageTimestamp)}</p></div><button onClick={() => { setDetail(null); setReviewDraft(null); }} className="rounded-lg border px-3 py-1">{copy.close}</button></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2"><div><h3 className="font-semibold">{copy.rawMessage}</h3><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{detail.rawMessage || copy.rawExpired}</pre></div><div><h3 className="font-semibold">{copy.structuredExtraction}</h3><pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-slate-100 p-4 text-xs">{JSON.stringify(detail.structuredData, null, 2)}</pre></div></div>
      <section className="mt-5 rounded-2xl border bg-slate-50 p-4"><div className="mb-4"><h3 className="font-semibold">{copy.editFields}</h3><p className="text-xs text-slate-500">{copy.editFieldsDescription}</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-xs font-medium text-slate-600"><span>{copy.fieldSector}</span><select value={reviewDraft.primarySector} onChange={(event) => updateReviewSector(event.target.value as ReviewSector)} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm">{REVIEW_SECTORS.map((value) => <option key={value} value={value}>{copy.reviewSectorNames[value]}</option>)}</select></label>
        <fieldset className="rounded-xl border bg-white px-3 py-2 md:col-span-1 xl:col-span-2"><legend className="px-1 text-xs font-medium text-slate-600">{copy.fieldScopes}</legend><div className="flex flex-wrap gap-3">{REVIEW_SCOPES.map((value) => <label key={value} className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={reviewDraft.marketplaceScopes.includes(value)} disabled={value === "GLOBAL"} onChange={(event) => updateReviewScope(value, event.target.checked)} />{copy.scopeNames[value]}</label>)}</div></fieldset>
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900 md:col-span-2 xl:col-span-3"><b>{copy.sectorEvidence}:</b> {copy.sectorConfidence} %{detail.sectorConfidenceScore ?? "-"}<pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap">{JSON.stringify(detail.sectorEvidence || {}, null, 2)}</pre></div>
        <ReviewField label={copy.fieldTitle} value={reviewDraft.title} onChange={(value) => updateReviewDraft("title", value)} />
        <ReviewField label={copy.fieldOrigin} value={reviewDraft.originCity} onChange={(value) => updateReviewDraft("originCity", value)} />
        <ReviewField label={copy.fieldDestination} value={reviewDraft.destinationCity} onChange={(value) => updateReviewDraft("destinationCity", value)} />
        <ReviewField label={copy.fieldCargo} value={reviewDraft.cargoType} onChange={(value) => updateReviewDraft("cargoType", value)} />
        <ReviewField label={copy.fieldTonnageMin} type="number" value={reviewDraft.tonnageMin} onChange={(value) => updateReviewDraft("tonnageMin", value)} />
        <ReviewField label={copy.fieldTonnageMax} type="number" value={reviewDraft.tonnageMax} onChange={(value) => updateReviewDraft("tonnageMax", value)} />
        <label className="text-xs font-medium text-slate-600"><span>{copy.fieldTrailer}</span><select value={reviewDraft.trailerType} onChange={(event) => updateReviewDraft("trailerType", event.target.value)} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm"><option value="">{copy.unspecified}</option>{TRAILER_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <ReviewField label={copy.fieldLoadingDate} type="date" value={reviewDraft.loadingDate} onChange={(value) => updateReviewDraft("loadingDate", value)} />
        <ReviewField label={copy.fieldAmount} type="number" value={reviewDraft.freightAmount} onChange={(value) => updateReviewDraft("freightAmount", value)} />
        <ReviewField label={copy.fieldCurrency} value={reviewDraft.freightCurrency} onChange={(value) => updateReviewDraft("freightCurrency", value.toUpperCase().slice(0, 3))} />
        <ReviewField label={copy.fieldPublicPhone} value={reviewDraft.publicContactPhone} onChange={(value) => updateReviewDraft("publicContactPhone", value)} />
        <label className="text-xs font-medium text-slate-600 md:col-span-2 xl:col-span-2"><span>{copy.fieldDescription}</span><textarea value={reviewDraft.normalizedDescription} onChange={(event) => updateReviewDraft("normalizedDescription", event.target.value)} rows={3} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm" /></label>
        {detail.listingType === "DRIVER" ? <>
          <label className="text-xs font-medium text-slate-600"><span>{copy.driverListingType}</span><select value={reviewDraft.driverListingType} onChange={(event) => updateReviewDraft("driverListingType", event.target.value)} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm"><option value="">{copy.unspecified}</option>{DRIVER_LISTING_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <ReviewField label={copy.driverLicenseClasses} value={reviewDraft.driverLicenseClasses} onChange={(value) => updateReviewDraft("driverLicenseClasses", value)} />
          <ReviewField label={copy.driverExperienceYears} type="number" value={reviewDraft.driverExperienceYears} onChange={(value) => updateReviewDraft("driverExperienceYears", value)} />
          <label className="text-xs font-medium text-slate-600"><span>{copy.driverEmploymentType}</span><select value={reviewDraft.driverEmploymentType} onChange={(event) => updateReviewDraft("driverEmploymentType", event.target.value)} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm"><option value="">{copy.unspecified}</option>{["FULL_TIME", "PART_TIME", "CONTRACT", "DAILY"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <ReviewCheckbox label={copy.driverInternationalExperience} checked={reviewDraft.driverInternationalExperience} onChange={(value) => updateReviewBoolean("driverInternationalExperience", value)} />
          <ReviewCheckbox label={copy.driverAdrCertificate} checked={reviewDraft.driverAdrCertificate} onChange={(value) => updateReviewBoolean("driverAdrCertificate", value)} />
          <ReviewCheckbox label={copy.driverSrcCertificate} checked={reviewDraft.driverSrcCertificate} onChange={(value) => updateReviewBoolean("driverSrcCertificate", value)} />
          <ReviewCheckbox label={copy.driverPsychotechnicalCertificate} checked={reviewDraft.driverPsychotechnicalCertificate} onChange={(value) => updateReviewBoolean("driverPsychotechnicalCertificate", value)} />
        </> : null}
      </div></section>
      {detail.similar.length ? <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"><b>{copy.similarListings}</b><ul className="mt-2 space-y-1">{detail.similar.map((item) => <li key={item.id}>{item.reviewStatus} · {date(item.createdAt)}</li>)}</ul></section> : null}
      <div className="mt-5 flex flex-wrap justify-between gap-2"><button className="adminButton" disabled={Boolean(groups.find((item) => item.id === detail.inboundMessage.group.id)?.ingestionPausedAt) || Boolean(busy)} onClick={() => void pauseReviewSource()}><PauseCircle className="size-4" />{copy.pauseReviewSource}</button><div className="flex flex-wrap justify-end gap-2"><button className="adminButton" disabled={Boolean(busy)} onClick={() => void reviewAction("duplicate")}>{copy.duplicate}</button><button className="adminButtonDanger" disabled={Boolean(busy)} onClick={() => void reviewAction("reject")}>{copy.reject}</button><button className="adminButtonSuccess" disabled={Boolean(busy)} onClick={() => void reviewAction("publish")}>{copy.publish}</button></div></div>
    </div></div> : null}
    <style jsx global>{`.adminButton,.adminButtonSuccess,.adminButtonDanger{display:inline-flex;align-items:center;gap:.4rem;border-radius:.75rem;border:1px solid #e2e8f0;padding:.6rem .85rem;font-size:.8rem;font-weight:650;background:white}.adminButtonSuccess{border-color:#16a34a;background:#16a34a;color:white}.adminButtonDanger{border-color:#dc2626;background:#dc2626;color:white}.adminButton:disabled,.adminButtonSuccess:disabled,.adminButtonDanger:disabled{opacity:.45;cursor:not-allowed}`}</style>
  </div>;
}

const adminWhatsAppCopy = {
  tr: {
    changeReasonPrompt: "Bu değişikliğin nedenini yazın:", bulkApprovalConfirm: "Seçili grupların lojistik kaynağı olduğunu onaylıyor musunuz?", bulkReasonPrompt: "Toplu değişiklik nedenini yazın:", pauseReasonPrompt: "Durdurma nedenini yazın:", resumeReasonPrompt: "Devam ettirme nedenini yazın:", emergencyConfirm: "Acil durdurma anahtarı tüm yeni ingestion işlemlerini keser. Devam edilsin mi?", actionReason: (action: string) => `İşlem nedeni (${action}):`,
    eyebrow: "WhatsApp canlı lojistik motoru", title: "WhatsApp Canlı İlan Kaynakları", description: "Yalnızca açıkça onayladığınız gruplar işlenir. Grup ve gönderici kimlikleri hiçbir kullanıcı API’sinde yayımlanmaz.", refresh: "Yenile", resume: "Devam et", pauseAll: "Tümünü durdur", emergencyStop: "Acil durdur", paused: "Ingestion durduruldu.", pausedDescription: "Yeni mesajlar işlenmiyor.",
    connectedAccounts: "Bağlı hesap", activeGroups: "Aktif grup", lastHourMessages: "Son 1 saat mesaj", pendingReview: "İnceleme bekleyen", p95Latency: "p95 gecikme", autoPublished: "Otomatik yayın", matches: "Eşleşme", failedAiRequests: "Başarısız AI çağrısı", failedJobs: "Başarısız iş", deadLetter: "Dead letter", pushSuccess: "Push başarı", workerHealth: "Ingestion worker", healthy: "Sağlıklı", offline: "Çevrimdışı", lastSuccessfulEvent: "Son başarılı olay", lastReconnect: "Son bağlantı",
    searchPlaceholder: "Grup adı veya JID ara", allGroups: "Tüm gruplar", enabled: "Etkin", disabled: "Devre dışı", enableSelected: "Seçilenleri etkinleştir", disableSelected: "Seçilenleri kapat", groupJid: "Grup / WhatsApp JID", connection: "Bağlantı", participants: "Katılımcı", lastMessage: "Son mesaj", counts: "İşlenen / Yayın / Hata", automatic: "Otomatik yayın", manualReview: "Manuel inceleme", minimumConfidence: "Min. güven", sectorHint: "Sektör ipucu", sectorNames: { GENERAL_LOGISTICS: "Genel lojistik", HOME_MOVING: "Evden Eve", PARTIAL_LOAD: "Parsiyel", HEAVY_HAUL: "Ağır Nakliyat", MIXED: "Karma", UNKNOWN: "Bilinmiyor" }, state: "Durum", aiRecommendation: "AI lojistik önerisi", ingestion: "Ingestion", automaticShort: "Otomatik", reviewShort: "İnceleme", continueSource: "Devam ettir", pauseSource: "Duraklat", noGroups: "Filtreye uygun grup bulunamadı.",
    reviewQueue: "Manuel inceleme kuyruğu", reviewDescription: "Eksik, şüpheli veya eşik altındaki ilanlar otomatik yayımlanmaz.", listing: "İlan", sourceGroup: "Kaynak grup", confidence: "Güven", missingFields: "Eksik alanlar", time: "Zaman", inspect: "İncele", noReview: "Bekleyen inceleme yok.", routeMissing: "Rota çıkarılamadı", close: "Kapat", rawMessage: "Ham WhatsApp mesajı", rawExpired: "Ham metin saklama süresi dolmuş.", structuredExtraction: "Yapılandırılmış çıkarım", duplicate: "Tekrar ilan", reject: "Reddet", publish: "Düzenlenen alanlarla yayımla", reviewTitle: "İlan incelemesi", operationFailed: "İşlem tamamlanamadı.",
    editFields: "Yayınlanacak ilan alanları", editFieldsDescription: "Yalnızca mesajda açıkça bulunan bilgileri düzeltin. Boş alanlar tahmin edilmez.", fieldSector: "Ana sektör", fieldScopes: "Görüneceği pazarlar", sectorEvidence: "Sektör kanıtı", sectorConfidence: "sınıflandırma güveni", reviewSectorNames: { GENERAL_LOGISTICS: "Genel lojistik", HOME_MOVING: "Evden Eve", PARTIAL_LOAD: "Parsiyel", HEAVY_HAUL: "Ağır Nakliyat", MULTI_SECTOR: "Birden fazla sektör" }, scopeNames: { GLOBAL: "Genel pazar", HOME_MOVING: "Evden Eve", PARTIAL_LOAD: "Parsiyel", HEAVY_HAUL: "Ağır Nakliyat" }, fieldTitle: "Başlık", fieldOrigin: "Çıkış / şoför konumu", fieldDestination: "Varış", fieldCargo: "Yük türü", fieldTonnageMin: "Minimum tonaj", fieldTonnageMax: "Maksimum tonaj", fieldTrailer: "Dorse türü", fieldLoadingDate: "Yükleme / uygunluk tarihi", fieldAmount: "Navlun / ücret tutarı", fieldCurrency: "Para birimi", fieldPublicPhone: "Mesajdaki açık telefon", fieldDescription: "Açıklama", unspecified: "Belirtilmedi", similarListings: "Benzer ilanlar", pauseReviewSource: "Kaynak grubu duraklat", driverListingType: "Şoför ilan türü", driverLicenseClasses: "Ehliyet sınıfları (virgülle)", driverExperienceYears: "Deneyim yılı", driverEmploymentType: "Çalışma türü", driverInternationalExperience: "Uluslararası deneyim", driverAdrCertificate: "ADR belgesi", driverSrcCertificate: "SRC belgesi", driverPsychotechnicalCertificate: "Psikoteknik belgesi",
  },
  en: {
    changeReasonPrompt: "Enter the reason for this change:", bulkApprovalConfirm: "Do you confirm that the selected groups are logistics sources?", bulkReasonPrompt: "Enter the reason for this bulk change:", pauseReasonPrompt: "Enter the reason for pausing:", resumeReasonPrompt: "Enter the reason for resuming:", emergencyConfirm: "The emergency switch stops all new ingestion processing. Continue?", actionReason: (action: string) => `Reason for action (${action}):`,
    eyebrow: "WhatsApp live logistics engine", title: "WhatsApp Live Listing Sources", description: "Only explicitly approved groups are processed. Group and sender identifiers are never exposed by a user API.", refresh: "Refresh", resume: "Resume", pauseAll: "Pause all", emergencyStop: "Emergency stop", paused: "Ingestion is paused.", pausedDescription: "New messages are not being processed.",
    connectedAccounts: "Connected accounts", activeGroups: "Active groups", lastHourMessages: "Messages in the last hour", pendingReview: "Pending review", p95Latency: "p95 latency", autoPublished: "Auto-published", matches: "Matches", failedAiRequests: "Failed AI requests", failedJobs: "Failed jobs", deadLetter: "Dead letter", pushSuccess: "Push success", workerHealth: "Ingestion worker", healthy: "Healthy", offline: "Offline", lastSuccessfulEvent: "Last successful event", lastReconnect: "Last connection",
    searchPlaceholder: "Search group name or JID", allGroups: "All groups", enabled: "Enabled", disabled: "Disabled", enableSelected: "Enable selected", disableSelected: "Disable selected", groupJid: "Group / WhatsApp JID", connection: "Connection", participants: "Participants", lastMessage: "Last message", counts: "Processed / Published / Failed", automatic: "Automatic publishing", manualReview: "Manual review", minimumConfidence: "Min. confidence", sectorHint: "Sector hint", sectorNames: { GENERAL_LOGISTICS: "General logistics", HOME_MOVING: "Home moving", PARTIAL_LOAD: "Partial load", HEAVY_HAUL: "Heavy haul", MIXED: "Mixed", UNKNOWN: "Unknown" }, state: "Status", aiRecommendation: "AI logistics recommendation", ingestion: "Ingestion", automaticShort: "Automatic", reviewShort: "Review", continueSource: "Resume", pauseSource: "Pause", noGroups: "No groups match this filter.",
    reviewQueue: "Manual review queue", reviewDescription: "Incomplete, suspicious, or below-threshold listings are not published automatically.", listing: "Listing", sourceGroup: "Source group", confidence: "Confidence", missingFields: "Missing fields", time: "Time", inspect: "Review", noReview: "No pending reviews.", routeMissing: "Route could not be extracted", close: "Close", rawMessage: "Raw WhatsApp message", rawExpired: "The raw-text retention period has expired.", structuredExtraction: "Structured extraction", duplicate: "Mark duplicate", reject: "Reject", publish: "Publish edited fields", reviewTitle: "Listing review", operationFailed: "The operation could not be completed.",
    editFields: "Listing fields to publish", editFieldsDescription: "Correct only information explicitly present in the message. Empty fields are never guessed.", fieldSector: "Primary sector", fieldScopes: "Marketplace visibility", sectorEvidence: "Sector evidence", sectorConfidence: "classification confidence", reviewSectorNames: { GENERAL_LOGISTICS: "General logistics", HOME_MOVING: "Home moving", PARTIAL_LOAD: "Partial load", HEAVY_HAUL: "Heavy haul", MULTI_SECTOR: "Multiple sectors" }, scopeNames: { GLOBAL: "Global marketplace", HOME_MOVING: "Home moving", PARTIAL_LOAD: "Partial load", HEAVY_HAUL: "Heavy haul" }, fieldTitle: "Title", fieldOrigin: "Origin / driver location", fieldDestination: "Destination", fieldCargo: "Cargo type", fieldTonnageMin: "Minimum tonnage", fieldTonnageMax: "Maximum tonnage", fieldTrailer: "Trailer type", fieldLoadingDate: "Loading / availability date", fieldAmount: "Freight / salary amount", fieldCurrency: "Currency", fieldPublicPhone: "Public phone in message", fieldDescription: "Description", unspecified: "Unspecified", similarListings: "Similar listings", pauseReviewSource: "Pause source group", driverListingType: "Driver listing type", driverLicenseClasses: "Licence classes (comma-separated)", driverExperienceYears: "Experience years", driverEmploymentType: "Employment type", driverInternationalExperience: "International experience", driverAdrCertificate: "ADR certificate", driverSrcCertificate: "SRC certificate", driverPsychotechnicalCertificate: "Psychotechnical certificate",
  },
};

const TRAILER_TYPES = ["CURTAINSIDER", "OPEN_TRAILER", "CLOSED_TRAILER", "REFRIGERATED", "CONTAINER", "LOWBED", "TRUCK", "VAN", "OTHER"] as const;
const DRIVER_LISTING_TYPES = ["DRIVER_AVAILABLE", "DRIVER_WANTED"] as const;
const SECTOR_HINTS: Group["sectorHint"][] = ["UNKNOWN", "GENERAL_LOGISTICS", "HOME_MOVING", "PARTIAL_LOAD", "HEAVY_HAUL", "MIXED"];
const REVIEW_SECTORS: ReviewSector[] = ["GENERAL_LOGISTICS", "HOME_MOVING", "PARTIAL_LOAD", "HEAVY_HAUL", "MULTI_SECTOR"];
const REVIEW_SCOPES: ReviewScope[] = ["GLOBAL", "HOME_MOVING", "PARTIAL_LOAD", "HEAVY_HAUL"];

function ReviewField({ label, value, type = "text", onChange }: { label: string; value: string; type?: "text" | "number" | "date"; onChange: (value: string) => void }) {
  return <label className="text-xs font-medium text-slate-600"><span>{label}</span><input type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "any" : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm" /></label>;
}

function ReviewCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-xs font-medium text-slate-600"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function Toggle({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: () => void }) { return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange} className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-emerald-500" : "bg-slate-300"}`}><span className={`absolute top-1 size-4 rounded-full bg-white transition ${checked ? "left-6" : "left-1"}`}/></button>; }
async function api<T = unknown>(url: string, options?: RequestInit): Promise<T> { const response = await fetch(url, { credentials: "same-origin", headers: { "Content-Type": "application/json", ...(options?.headers || {}) }, ...options }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || `HTTP_${response.status}`); return payload as T; }
function message(error: unknown) { return error instanceof Error ? error.message : "REQUEST_FAILED"; }
function date(value: string | null) { return value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "-"; }
function duration(value: number | null) { return value == null ? "-" : value < 1_000 ? `${value} ms` : `${(value / 1_000).toFixed(1)} sn`; }

function toReviewDraft(review: ReviewDetail): ReviewDraft {
  const structured = review.structuredData && typeof review.structuredData === "object" ? review.structuredData : {};
  return {
    primarySector: REVIEW_SECTORS.includes(review.sectorClassification) ? review.sectorClassification : "GENERAL_LOGISTICS",
    marketplaceScopes: normalizeReviewScopes(review.marketplaceScopes),
    title: review.title || "",
    normalizedDescription: review.normalizedDescription || "",
    originCity: review.originCity || "",
    destinationCity: review.destinationCity || "",
    cargoType: review.cargoType || "",
    tonnageMin: review.tonnageMin == null ? "" : String(review.tonnageMin),
    tonnageMax: review.tonnageMax == null ? "" : String(review.tonnageMax),
    trailerType: review.trailerType || "",
    loadingDate: review.loadingDate ? review.loadingDate.slice(0, 10) : "",
    freightAmount: review.freightAmount == null ? "" : String(review.freightAmount),
    freightCurrency: review.freightCurrency || "",
    publicContactPhone: review.publicContactPhone || "",
    driverListingType: structuredStringValue(structured, "driverListingType"),
    driverLicenseClasses: structuredStringArrayValue(structured, "driverLicenseClasses").join(", "),
    driverExperienceYears: structuredNumberValue(structured, "driverExperienceYears"),
    driverEmploymentType: structuredStringValue(structured, "driverEmploymentType"),
    driverInternationalExperience: structuredBooleanValue(structured, "driverInternationalExperience"),
    driverAdrCertificate: structuredBooleanValue(structured, "driverAdrCertificate"),
    driverSrcCertificate: structuredBooleanValue(structured, "driverSrcCertificate"),
    driverPsychotechnicalCertificate: structuredBooleanValue(structured, "driverPsychotechnicalCertificate"),
  };
}

function publicationFields(draft: ReviewDraft | null, includeDriverFields: boolean) {
  if (!draft) throw new Error("WHATSAPP_INGESTION_REVIEW_DRAFT_MISSING");
  const common = {
    primarySector: draft.primarySector,
    marketplaceScopes: normalizeReviewScopes(draft.marketplaceScopes),
    title: nullableText(draft.title),
    normalizedDescription: nullableText(draft.normalizedDescription),
    originCity: nullableText(draft.originCity),
    destinationCity: nullableText(draft.destinationCity),
    cargoType: nullableText(draft.cargoType),
    tonnageMin: nullablePositiveNumber(draft.tonnageMin),
    tonnageMax: nullablePositiveNumber(draft.tonnageMax),
    trailerType: draft.trailerType ? draft.trailerType : null,
    loadingDate: draft.loadingDate || null,
    freightAmount: nullablePositiveNumber(draft.freightAmount),
    freightCurrency: nullableText(draft.freightCurrency)?.toUpperCase() ?? null,
    publicContactPhone: nullableText(draft.publicContactPhone),
  };
  if (!includeDriverFields) return common;
  const allowedLicenses = new Set(["B", "C", "CE", "D", "DE"]);
  const driverLicenseClasses = [...new Set(draft.driverLicenseClasses.split(",").map((value) => value.trim().toUpperCase()).filter((value) => allowedLicenses.has(value)))];
  return {
    ...common,
    driverListingType: draft.driverListingType || null,
    driverLicenseClasses,
    driverExperienceYears: nullableNonNegativeInteger(draft.driverExperienceYears),
    driverEmploymentType: draft.driverEmploymentType || null,
    driverInternationalExperience: draft.driverInternationalExperience,
    driverAdrCertificate: draft.driverAdrCertificate,
    driverSrcCertificate: draft.driverSrcCertificate,
    driverPsychotechnicalCertificate: draft.driverPsychotechnicalCertificate,
  };
}

function normalizeReviewScopes(scopes: ReviewScope[]) {
  return [...new Set<ReviewScope>(["GLOBAL", ...scopes.filter((scope) => REVIEW_SCOPES.includes(scope))])];
}

function scopesForReviewSector(primarySector: ReviewSector, current: ReviewScope[]): ReviewScope[] {
  if (primarySector === "GENERAL_LOGISTICS") return ["GLOBAL"];
  if (primarySector === "HOME_MOVING") return ["GLOBAL", "HOME_MOVING"];
  if (primarySector === "PARTIAL_LOAD") return ["GLOBAL", "PARTIAL_LOAD"];
  if (primarySector === "HEAVY_HAUL") return ["GLOBAL", "HEAVY_HAUL"];
  const specialized = normalizeReviewScopes(current).filter((scope) => scope !== "GLOBAL");
  return specialized.length >= 2 ? ["GLOBAL", ...specialized] : ["GLOBAL", "HOME_MOVING", "PARTIAL_LOAD"];
}

function nullableText(value: string) {
  return value.trim() || null;
}

function nullablePositiveNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("WHATSAPP_INGESTION_REVIEW_NUMBER_INVALID");
  return parsed;
}

function nullableNonNegativeInteger(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 60) throw new Error("WHATSAPP_INGESTION_REVIEW_NUMBER_INVALID");
  return parsed;
}

function structuredStringValue(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string" ? value[key] : "";
}

function structuredNumberValue(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "number" ? String(value[key]) : "";
}

function structuredStringArrayValue(value: Record<string, unknown>, key: string) {
  return Array.isArray(value[key]) ? value[key].filter((item): item is string => typeof item === "string") : [];
}

function structuredBooleanValue(value: Record<string, unknown>, key: string) {
  return value[key] === true;
}
