"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, LoaderCircle, Lock, Pencil, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";

import { CategoryColorPicker } from "@/components/category-color-picker";
import { apiErrorMessage } from "@/i18n/api-error";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

type Group = { id: string; name: string; account: { label: string } };
type Category = {
  id: string;
  name: string;
  color: string;
  description?: string | null;
  _count: { groups: number; contacts: number };
  assignedGroupCount?: number;
  assignedContactCount?: number;
  groups: Array<{ groupId: string }>;
};
type Contact = { id: string; accountId: string; name: string; pushName: string | null; displayName?: string | null; phone: string; assigned?: boolean };
type PageInfo = { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
type ContactResponse = {
  contacts?: Contact[];
  assignedContactIds?: string[];
  assignedContactCount?: number;
  pageInfo?: PageInfo;
  error?: string;
  message?: string;
};
type Data = {
  groups: Group[];
  categories: Category[];
  entitlements?: { contactMessaging?: boolean } | null;
};
type Translate = (key: string, params?: Record<string, string | number>) => string;

const button = "inline-flex items-center justify-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted-background disabled:opacity-60";
const primary = "inline-flex items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-60";

async function responseMessage(response: Response, t: Translate) {
  const body = await response.json().catch(() => ({}));
  return apiErrorMessage(t, body);
}

function audienceSummary(category: Category, t: Translate) {
  const groupCount = category.assignedGroupCount ?? category._count.groups ?? 0;
  const contactCount = category.assignedContactCount ?? category._count.contacts ?? 0;
  if (groupCount && contactCount) return t("composer.groupContactCount", { groups: groupCount, contacts: contactCount });
  if (groupCount) return t("composer.groupCount", { count: groupCount });
  if (contactCount) return t("composer.contactCount", { count: contactCount });
  return t("categories.noAudienceAssigned");
}

export function CategoriesManagementPage() {
  const { t } = useI18n();
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [contactPageInfo, setContactPageInfo] = useState<PageInfo | null>(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState("");
  const contactRequestVersion = useRef(0);
  const initializedCategoryId = useRef<string | null>(null);

  const load = useCallback(() => fetch("/api/platform", { cache: "no-store" }).then((response) => response.json()).then(setData), []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetContactEditor = useCallback((categoryId?: string) => {
    contactRequestVersion.current += 1;
    initializedCategoryId.current = categoryId ? null : "__NEW__";
    setContactSearch("");
    setContacts([]);
    setSelectedContactIds([]);
    setContactPageInfo(null);
    setContactError("");
  }, []);

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    resetContactEditor();
  };

  const openEdit = (category: Category) => {
    setCreating(false);
    setEditing(category);
    resetContactEditor(category.id);
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    resetContactEditor();
  };

  const loadContacts = useCallback(async (page = 1, append = false) => {
    if (!data?.entitlements?.contactMessaging || (!creating && !editing)) return;
    const requestVersion = ++contactRequestVersion.current;
    setContactLoading(true);
    setContactError("");
    try {
      const query = new URLSearchParams({ page: String(page), limit: "50" });
      if (contactSearch.trim()) query.set("search", contactSearch.trim());
      const endpoint = editing
        ? `/api/categories/${editing.id}/contacts?${query.toString()}`
        : `/api/whatsapp/contacts?${query.toString()}`;
      const response = await fetch(endpoint, { cache: "no-store" });
      const body = await response.json() as ContactResponse;
      if (!response.ok) throw new Error(apiErrorMessage(t, body, "composer.contactsLoadFailed"));
      if (requestVersion !== contactRequestVersion.current) return;
      const rows = body.contacts ?? [];
      setContacts((current) => {
        if (!append) return rows;
        const byId = new Map(current.map((contact) => [contact.id, contact]));
        for (const contact of rows) byId.set(contact.id, contact);
        return [...byId.values()];
      });
      setContactPageInfo(body.pageInfo ?? null);
      if (editing && initializedCategoryId.current !== editing.id) {
        setSelectedContactIds(body.assignedContactIds ?? []);
        initializedCategoryId.current = editing.id;
      }
    } catch (error) {
      if (requestVersion === contactRequestVersion.current) {
        setContactError(error instanceof Error ? error.message : t("composer.contactsLoadFailed"));
      }
    } finally {
      if (requestVersion === contactRequestVersion.current) setContactLoading(false);
    }
  }, [contactSearch, creating, data?.entitlements?.contactMessaging, editing, t]);

  useEffect(() => {
    if (!creating && !editing) return;
    const timer = setTimeout(() => void loadContacts(1, false), 300);
    return () => clearTimeout(timer);
  }, [contactSearch, creating, editing, loadContacts]);

  async function refreshContacts() {
    setContactLoading(true);
    setContactError("");
    try {
      const response = await fetch("/api/whatsapp/contacts/sync-current", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = await response.json() as { syncRunId?: string; message?: string; error?: string };
      if (!response.ok) throw new Error(apiErrorMessage(t, body, "composer.contactsRefreshFailed"));
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        const statusResponse = await fetch("/api/whatsapp/contacts?limit=10", { cache: "no-store" });
        const statusBody = await statusResponse.json() as { syncRun?: { id: string; status: string } | null };
        if (!statusResponse.ok) throw new Error(t("composer.contactsRefreshFailed"));
        if (body.syncRunId && statusBody.syncRun?.id === body.syncRunId && ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(statusBody.syncRun.status)) {
          if (statusBody.syncRun.status === "FAILED") throw new Error(t("composer.contactsRefreshFailed"));
          break;
        }
      }
      await loadContacts(1, false);
    } catch (error) {
      setContactError(error instanceof Error ? error.message : t("composer.contactsRefreshFailed"));
      setContactLoading(false);
    }
  }

  function toggleContact(contactId: string) {
    setSelectedContactIds((current) => current.includes(contactId) ? current.filter((id) => id !== contactId) : [...current, contactId]);
  }

  function toggleVisibleContacts() {
    const visibleIds = contacts.map((contact) => contact.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedContactIds.includes(id));
    setSelectedContactIds((current) => allSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : [...new Set([...current, ...visibleIds])]);
  }

  const loadedAssignedContacts = useMemo(
    () => contacts.filter((contact) => selectedContactIds.includes(contact.id)),
    [contacts, selectedContactIds],
  );
  const loadedAssignableContacts = useMemo(
    () => contacts.filter((contact) => !selectedContactIds.includes(contact.id)),
    [contacts, selectedContactIds],
  );

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        description: form.get("description"),
        color: form.get("color"),
        groupIds: form.getAll("groupIds"),
        contactIds: selectedContactIds,
      }),
    });
    setStatus(response.ok ? t("categories.created") : await responseMessage(response, t));
    if (response.ok) {
      closeForm();
      void load();
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !data) return;
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/categories/${editing.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        description: form.get("description") || null,
        color: form.get("color"),
        groupIds: form.getAll("groupIds").map(String),
        ...(data.entitlements?.contactMessaging ? { contactIds: selectedContactIds } : {}),
      }),
    });
    setStatus(response.ok ? t("categories.saved") : await responseMessage(response, t));
    if (response.ok) {
      closeForm();
      void load();
    }
  }

  async function archive(category: Category, mode: "archive" | "delete") {
    const message = mode === "archive" ? t("categories.confirmArchive", { name: category.name }) : t("categories.confirmDelete", { name: category.name });
    if (!confirm(message)) return;
    const response = await fetch(`/api/categories/${category.id}`, { method: "DELETE" });
    setStatus(response.ok ? t("categories.archived") : await responseMessage(response, t));
    void load();
  }

  if (!data) return <LoaderCircle className="size-7 animate-spin text-orange-500" />;

  const form = (category?: Category) => (
    <form onSubmit={category ? save : create} className="rounded-lg border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">{category ? t("categories.editTitle") : t("categories.newTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("categories.manageAudienceDescription")}</p>
        </div>
        <button type="button" onClick={closeForm} title={t("common.close")} className={button}>
          <X className="size-5" />
          <span className="sr-only">{t("common.close")}</span>
        </button>
      </div>
      <div className="mt-5 grid gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="mb-2 block text-xs font-medium">{t("categories.name")}</span>
            <input required name="name" defaultValue={category?.name} className="w-full rounded-lg border bg-input p-3 text-input-foreground placeholder:text-muted-foreground" />
          </label>
          <label>
            <span className="mb-2 block text-xs font-medium">{t("categories.categoryDescription")}</span>
            <input name="description" defaultValue={category?.description ?? ""} className="w-full rounded-lg border bg-input p-3 text-input-foreground placeholder:text-muted-foreground" />
          </label>
        </div>
        <CategoryColorPicker
          key={category?.id ?? "new-category-color"}
          defaultValue={category?.color}
          label={t("categories.chooseColor")}
          changeLabel={t("categories.changeColor")}
          selectedLabel={t("categories.selectedColor")}
        />

        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{t("common.groups")}</p>
            <span className="text-xs text-muted">{t("categories.availableGroups", { count: data.groups.length })}</span>
          </div>
          <div className="grid max-h-64 gap-2 overflow-auto sm:grid-cols-2">
            {data.groups.map((group) => (
              <label key={group.id} className="flex min-h-12 items-center rounded-lg border bg-card p-3 text-sm text-card-foreground hover:bg-muted-background">
                <input name="groupIds" value={group.id} defaultChecked={category?.groups.some((item) => item.groupId === group.id)} type="checkbox" className="me-2 size-4" />
                <span className="min-w-0"><b className="block truncate">{group.name}</b><small className="text-muted">{group.account.label}</small></span>
              </label>
            ))}
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{t("common.contacts")}</p>
              <p className="mt-1 text-xs text-muted">{t("composer.selectedCount", { count: selectedContactIds.length })}</p>
            </div>
            {data.entitlements?.contactMessaging ? (
              <button type="button" disabled={contactLoading} onClick={() => void refreshContacts()} className={button}>
                <RefreshCw className={cn("size-4", contactLoading && "animate-spin")} />
                {t("composer.refreshContacts")}
              </button>
            ) : null}
          </div>
          {!data.entitlements?.contactMessaging ? (
            <div className="mt-3 flex items-center gap-3 rounded-lg border bg-accent p-4 text-sm text-accent-foreground">
              <Lock className="size-5 text-primary" />
              {t("categories.contactAssignmentProfessional")}
            </div>
          ) : (
            <>
              <label className="mt-3 flex items-center gap-2 rounded-lg border bg-input px-3 text-input-foreground">
                <Search className="size-4 text-muted" />
                <input value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} placeholder={t("composer.searchContacts")} className="w-full bg-transparent py-3 text-sm outline-none" />
              </label>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                <label className="flex min-h-8 cursor-pointer items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={contacts.length > 0 && contacts.every((contact) => selectedContactIds.includes(contact.id))}
                    onChange={toggleVisibleContacts}
                    className="size-4"
                  />
                  {t("composer.selectVisibleContacts")}
                </label>
                <span className="font-semibold text-primary">{t("categories.selectedContacts", { count: selectedContactIds.length })}</span>
              </div>
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase text-muted">{t("categories.assignedContacts")}</p>
                {loadedAssignedContacts.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {loadedAssignedContacts.slice(0, 12).map((contact) => (
                      <button key={contact.id} type="button" onClick={() => toggleContact(contact.id)} className={button} title={t("categories.removeFromCategory")}>
                        {contact.displayName || contact.name}<X className="size-3" />
                      </button>
                    ))}
                  </div>
                ) : <p className="mt-2 text-sm text-muted">{t("categories.noAssignedContacts")}</p>}
              </div>
              <p className="mt-4 text-xs font-semibold uppercase text-muted">{t("categories.assignableContacts")}</p>
              {contactError ? <p className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-danger">{contactError}</p> : null}
              {!contacts.length && contactLoading ? (
                <div className="mt-3 flex items-center gap-2 text-sm text-muted"><LoaderCircle className="size-4 animate-spin" />{t("composer.contactsLoading")}</div>
              ) : loadedAssignableContacts.length ? (
                <div className="mt-2 grid max-h-[460px] gap-2 overflow-auto md:grid-cols-2">
                  {loadedAssignableContacts.map((contact) => {
                    const selected = false;
                    return (
                      <label key={contact.id} className={cn("flex min-h-14 items-center gap-3 rounded-lg border p-3 text-sm", selected && "border-primary bg-accent text-accent-foreground")}>
                        <input type="checkbox" checked={selected} onChange={() => toggleContact(contact.id)} className="size-4" />
                        <span className="min-w-0"><b className="block truncate">{contact.displayName || contact.name}</b><small className="text-muted">+{contact.phone}</small></span>
                      </label>
                    );
                  })}
                </div>
              ) : <p className="mt-3 rounded-lg border p-4 text-sm text-muted">{contacts.length ? t("categories.allVisibleAssigned") : t("composer.noContacts")}</p>}
              {contactPageInfo?.hasMore ? (
                <button type="button" disabled={contactLoading} onClick={() => void loadContacts(contactPageInfo.page + 1, true)} className={cn(button, "mt-3 w-full")}>
                  {contactLoading ? t("common.loading") : t("composer.loadMoreContacts")}
                </button>
              ) : null}
            </>
          )}
        </section>

        <div className="sticky bottom-3 flex items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-lg">
          <span className="text-sm font-semibold">{t("categories.selectedContacts", { count: selectedContactIds.length })}</span>
          <button className={primary}>
            {category ? <Save className="size-4" /> : <Plus className="size-4" />}
            {category ? t("categories.saveChanges") : t("categories.create")}
          </button>
        </div>
      </div>
    </form>
  );

  return (
    <>
      <header className="mb-7 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-orange-500">{t("categories.eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-semibold">{t("categories.title")}</h1>
          <p className="mt-2 text-sm text-muted">{t("categories.description")}</p>
        </div>
        <button className={primary} onClick={openCreate}>
          <Plus className="size-4" />
          {t("categories.new")}
        </button>
      </header>
      {status && <p className="mb-5 rounded-lg border bg-card p-3 text-sm">{status}</p>}
      {creating && <div className="mb-6">{form()}</div>}
      {editing && <div className="mb-6">{form(editing)}</div>}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {data.categories.map((category) => (
          <article key={category.id} className="rounded-lg border bg-card p-5">
            <span className="block size-3 rounded-full" style={{ background: category.color }} />
            <h2 className="mt-5 font-semibold">{category.name}</h2>
            {category.description ? <p className="mt-1 line-clamp-2 text-sm text-muted">{category.description}</p> : null}
            <p className="mt-2 text-sm font-medium text-muted">{audienceSummary(category, t)}</p>
            <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
              <button className={button} onClick={() => openEdit(category)}>
                <Pencil className="size-4" />
                {t("categories.edit")}
              </button>
              <button className={button} onClick={() => void archive(category, "archive")} title={t("categories.archive")}>
                <Archive className="size-4" />
                <span className="sr-only">{t("categories.archive")}</span>
              </button>
              <button className={button} onClick={() => void archive(category, "delete")} title={t("categories.delete")}>
                <Trash2 className="size-4" />
                <span className="sr-only">{t("categories.delete")}</span>
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
