"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import { FileText, Image as ImageIcon, LoaderCircle, Paperclip, Video, X } from "lucide-react";

export type WebAttachmentKind = "PHOTO" | "VIDEO" | "DOCUMENT";

export type WebMessageAttachment = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  kind: WebAttachmentKind;
  previewUrl?: string | null;
};

export type WebMessageAttachmentPickerLabels = {
  trigger: string;
  title: string;
  description: string;
  photo: string;
  video: string;
  document: string;
  close: string;
  remove: string;
  selected: string;
  limitReached: string;
  invalidType: string;
};

export type WebMessageAttachmentPickerProps = {
  attachments: readonly WebMessageAttachment[];
  onUpload: (files: File[]) => void | Promise<void>;
  onRemove: (id: string) => void | Promise<void>;
  uploading: boolean;
  error?: string | null;
  disabled?: boolean;
  maxFiles?: number;
  labels?: Partial<WebMessageAttachmentPickerLabels>;
  onValidationError?: (message: string) => void;
  className?: string;
};

export const WEB_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
export const WEB_VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm";
export const WEB_DOCUMENT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv";

const DEFAULT_LABELS: WebMessageAttachmentPickerLabels = {
  trigger: "Dosya ekle",
  title: "Dosya ekle",
  description: "Eklemek istediğiniz dosya türünü seçin.",
  photo: "Fotoğraf",
  video: "Video",
  document: "Belge",
  close: "Kapat",
  remove: "Eki kaldır",
  selected: "Seçili ekler",
  limitReached: "En fazla {count} dosya ekleyebilirsiniz.",
  invalidType: "Seçilen dosya türü desteklenmiyor.",
};

const actionButton = "flex min-h-20 w-full items-center gap-4 rounded-2xl border bg-background px-4 py-3 text-left text-sm font-semibold text-foreground transition hover:border-orange-400 hover:bg-orange-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function fileMatchesKind(file: File, kind: WebAttachmentKind) {
  if (kind === "PHOTO") return ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type.toLowerCase());
  if (kind === "VIDEO") return ["video/mp4", "video/quicktime", "video/webm"].includes(file.type.toLowerCase());
  const extension = file.name.toLowerCase().split(".").pop();
  return ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"].includes(extension || "");
}

function iconFor(kind: WebAttachmentKind) {
  if (kind === "PHOTO") return ImageIcon;
  if (kind === "VIDEO") return Video;
  return FileText;
}

export function WebMessageAttachmentPicker({
  attachments,
  onUpload,
  onRemove,
  uploading,
  error,
  disabled = false,
  maxFiles = 30,
  labels,
  onValidationError,
  className,
}: WebMessageAttachmentPickerProps) {
  const copy = useMemo(() => ({ ...DEFAULT_LABELS, ...labels }), [labels]);
  const safeMaxFiles = Math.max(1, Math.trunc(maxFiles));
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [viewport, setViewport] = useState<{ height: number; offsetTop: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const atLimit = attachments.length >= safeMaxFiles;
  const interactionDisabled = disabled || uploading;

  function closePicker() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const updateViewport = () => {
      const current = window.visualViewport;
      setViewport({
        height: Math.max(240, current?.height ?? window.innerHeight),
        offsetTop: Math.max(0, current?.offsetTop ?? 0),
      });
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]),a[href],input:not([disabled]):not([type='hidden']),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])",
      )).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    updateViewport();
    document.addEventListener("keydown", handleKeyDown);
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    window.requestAnimationFrame(() => firstActionRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
    };
  }, [open]);

  async function handleFiles(event: ChangeEvent<HTMLInputElement>, kind: WebAttachmentKind) {
    const input = event.currentTarget;
    const candidates = Array.from(input.files ?? []);
    input.value = "";
    if (!candidates.length) return;
    const matching = candidates.filter((file) => fileMatchesKind(file, kind));
    if (matching.length !== candidates.length) onValidationError?.(copy.invalidType);
    const remaining = Math.max(0, safeMaxFiles - attachments.length);
    const accepted = matching.slice(0, remaining);
    if (matching.length > remaining) onValidationError?.(copy.limitReached.replace("{count}", String(safeMaxFiles)));
    if (!accepted.length) return;
    try {
      await onUpload(accepted);
      closePicker();
    } catch {
      // The controlled parent owns and displays the upload error.
    }
  }

  const overlayStyle: CSSProperties | undefined = viewport
    ? { top: viewport.offsetTop, height: viewport.height }
    : undefined;
  const panelStyle: CSSProperties | undefined = viewport
    ? { maxHeight: Math.max(240, viewport.height - 24) }
    : undefined;

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => setOpen(true)}
        disabled={interactionDisabled || atLimit}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Paperclip className="h-4 w-4" aria-hidden="true" />}
        {copy.trigger}
      </button>

      {attachments.length > 0 && (
        <section className="mt-3" aria-label={copy.selected}>
          <ul className="flex flex-wrap gap-2">
            {attachments.map((attachment) => {
              const AttachmentIcon = iconFor(attachment.kind);
              return (
                <li key={attachment.id} className="flex max-w-full items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm text-foreground">
                  <AttachmentIcon className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
                  <span className="min-w-0"><span className="block max-w-56 truncate font-medium">{attachment.name}</span><span className="block text-xs text-muted">{formatBytes(attachment.size)}</span></span>
                  <button type="button" className="ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500" onClick={() => void onRemove(attachment.id)} disabled={interactionDisabled} aria-label={`${copy.remove}: ${attachment.name}`}><X className="h-4 w-4" aria-hidden="true" /></button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {error && <p id={errorId} className="mt-2 text-sm text-rose-600" role="alert">{error}</p>}

      {open && (
        <div
          className="fixed inset-x-0 z-[80] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
          style={overlayStyle}
          onMouseDown={(event) => { if (event.target === event.currentTarget) closePicker(); }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
            tabIndex={-1}
            className="w-full overflow-y-auto rounded-t-3xl border bg-card px-5 pt-5 shadow-2xl pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-3xl sm:p-6"
            style={panelStyle}
          >
            <div className="flex items-start justify-between gap-4">
              <div><h2 id={titleId} className="text-lg font-bold text-foreground">{copy.title}</h2><p id={descriptionId} className="mt-1 text-sm leading-6 text-muted">{copy.description}</p></div>
              <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500" onClick={closePicker} aria-label={copy.close}><X className="h-5 w-5" aria-hidden="true" /></button>
            </div>

            <div className="mt-5 grid gap-3">
              <button ref={firstActionRef} type="button" className={actionButton} onClick={() => photoInputRef.current?.click()} disabled={interactionDisabled || atLimit}><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-600"><ImageIcon className="h-5 w-5" aria-hidden="true" /></span>{copy.photo}</button>
              <button type="button" className={actionButton} onClick={() => videoInputRef.current?.click()} disabled={interactionDisabled || atLimit}><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-600"><Video className="h-5 w-5" aria-hidden="true" /></span>{copy.video}</button>
              <button type="button" className={actionButton} onClick={() => documentInputRef.current?.click()} disabled={interactionDisabled || atLimit}><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-600"><FileText className="h-5 w-5" aria-hidden="true" /></span>{copy.document}</button>
            </div>

            {atLimit && <p className="mt-4 rounded-xl bg-orange-500/10 p-3 text-sm text-orange-800 dark:text-orange-200">{copy.limitReached.replace("{count}", String(safeMaxFiles))}</p>}
            {error && <p className="mt-4 text-sm text-rose-600" role="alert">{error}</p>}

            <input ref={photoInputRef} type="file" accept={WEB_PHOTO_ACCEPT} multiple hidden onChange={(event) => void handleFiles(event, "PHOTO")} />
            <input ref={videoInputRef} type="file" accept={WEB_VIDEO_ACCEPT} multiple hidden onChange={(event) => void handleFiles(event, "VIDEO")} />
            <input ref={documentInputRef} type="file" accept={WEB_DOCUMENT_ACCEPT} multiple hidden onChange={(event) => void handleFiles(event, "DOCUMENT")} />
          </div>
        </div>
      )}
    </div>
  );
}
