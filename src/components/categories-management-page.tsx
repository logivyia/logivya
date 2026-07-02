"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Archive, LoaderCircle, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { CategoryColorPicker } from "@/components/category-color-picker";
import { useI18n } from "@/i18n/provider";

type Group = { id: string; name: string; account: { label: string } };
type Category = { id: string; name: string; color: string; _count: { groups: number }; groups: Array<{ groupId: string }> };
type Data = { groups: Group[]; categories: Category[] };
type Translate = (key: string, params?: Record<string, string | number>) => string;

const button = "inline-flex items-center justify-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted-background disabled:opacity-60";
const primary = "inline-flex items-center justify-center gap-2 rounded-xl border border-primary bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-60";

async function responseMessage(response: Response, t: Translate) {
  const body = await response.json().catch(() => ({}));
  return typeof body?.error === "string" ? t(body.error) : t("errors.generic");
}

export function CategoriesManagementPage() {
  const { t } = useI18n();
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState("");

  const load = useCallback(() => fetch("/api/platform", { cache: "no-store" }).then((response) => response.json()).then(setData), []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), color: form.get("color"), groupIds: form.getAll("groupIds") }),
    });

    setStatus(response.ok ? t("categories.created") : await responseMessage(response, t));
    if (response.ok) {
      setCreating(false);
      void load();
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !data) return;

    const form = new FormData(event.currentTarget);
    const selected = form.getAll("groupIds").map(String);
    const current = editing.groups.map((item) => item.groupId);
    const update = await fetch(`/api/categories/${editing.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), color: form.get("color") }),
    });

    if (!update.ok) {
      setStatus(await responseMessage(update, t));
      return;
    }

    const additions = selected.filter((id) => !current.includes(id));
    const removals = current.filter((id) => !selected.includes(id));
    if (additions.length) {
      await fetch(`/api/categories/${editing.id}/groups`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupIds: additions }),
      });
    }
    await Promise.all(removals.map((groupId) => fetch(`/api/categories/${editing.id}/groups/${groupId}`, { method: "DELETE" })));

    setStatus(t("categories.saved"));
    setEditing(null);
    void load();
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
    <form onSubmit={category ? save : create} className="rounded-2xl border bg-card p-5 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{category ? t("categories.editTitle") : t("categories.newTitle")}</h2>
        <button type="button" onClick={() => category ? setEditing(null) : setCreating(false)}>
          <X className="size-5" />
        </button>
      </div>
      <div className="mt-5 grid gap-4">
        <label>
          <span className="mb-2 block text-xs font-medium">{t("categories.name")}</span>
          <input required name="name" defaultValue={category?.name} className="w-full rounded-xl border bg-input p-3 text-input-foreground placeholder:text-muted-foreground" />
        </label>
        <CategoryColorPicker
          key={category?.id ?? "new-category-color"}
          defaultValue={category?.color}
          label={t("categories.chooseColor")}
          changeLabel={t("categories.changeColor")}
          selectedLabel={t("categories.selectedColor")}
        />
        <div>
          <p className="mb-2 text-xs font-medium">{t("categories.assignedGroups")}</p>
          <div className="grid max-h-64 gap-2 overflow-auto sm:grid-cols-2">
            {data.groups.map((group) => (
              <label key={group.id} className="rounded-xl border bg-card p-3 text-sm text-card-foreground hover:bg-muted-background">
                <input name="groupIds" value={group.id} defaultChecked={category?.groups.some((item) => item.groupId === group.id)} type="checkbox" className="me-2" />
                {group.name}
                <small className="ms-2 text-muted">{group.account.label}</small>
              </label>
            ))}
          </div>
        </div>
        <button className={primary}>
          {category ? <Save className="size-4" /> : <Plus className="size-4" />}
          {category ? t("categories.saveChanges") : t("categories.create")}
        </button>
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
        <button className={primary} onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          {t("categories.new")}
        </button>
      </header>
      {status && <p className="mb-5 rounded-xl border bg-card p-3 text-sm">{status}</p>}
      {creating && <div className="mb-6">{form()}</div>}
      {editing && <div className="mb-6">{form(editing)}</div>}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {data.categories.map((category) => (
          <article key={category.id} className="rounded-2xl border bg-card p-5">
            <span className="block size-3 rounded-full" style={{ background: category.color }} />
            <h2 className="mt-5 font-semibold">{category.name}</h2>
            <p className="mt-1 text-sm text-muted">{t("categories.assignedCount", { count: category._count.groups })}</p>
            <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
              <button className={button} onClick={() => setEditing(category)}>
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
