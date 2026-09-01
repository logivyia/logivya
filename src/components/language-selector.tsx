"use client";

import { Check, ChevronDown, Languages } from "lucide-react";
import { usePathname } from "next/navigation";
import { type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { locales, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

const MENU_WIDTH = 208;
const VIEWPORT_PADDING = 16;
const MENU_GAP = 8;

type MenuPosition = { left: number; top: number; maxHeight: number };

export function LanguageSelector({ dark = false }: { dark?: boolean }) {
  const { locale, localeNames, setLocale } = useI18n();
  const pathname = usePathname();
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    setMenuPosition(null);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const availableBelow = window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_PADDING;
    const availableAbove = rect.top - MENU_GAP - VIEWPORT_PADDING;
    const estimatedHeight = Math.min(320, locales.length * 40 + 16);
    const placeAbove = availableBelow < Math.min(estimatedHeight, 180) && availableAbove > availableBelow;
    const maxHeight = Math.max(120, Math.min(320, placeAbove ? availableAbove : availableBelow));
    const unclampedLeft = rect.left + rect.width / 2 - MENU_WIDTH / 2;
    const left = Math.min(window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, unclampedLeft));
    const top = placeAbove
      ? Math.max(VIEWPORT_PADDING, rect.top - MENU_GAP - Math.min(estimatedHeight, maxHeight))
      : rect.bottom + MENU_GAP;
    setMenuPosition({ left, top, maxHeight });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const selectedIndex = Math.max(0, locales.indexOf(locale as Locale));
    window.requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus());
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) closeMenu();
    };
    const onViewportChange = () => updateMenuPosition();
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [closeMenu, locale, open, updateMenuPosition]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => closeMenu());
    return () => window.cancelAnimationFrame(frame);
  }, [closeMenu, pathname]);

  const openAndFocus = (index: number) => {
    setOpen(true);
    window.requestAnimationFrame(() => optionRefs.current[index]?.focus());
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openAndFocus(event.key === "ArrowUp" ? locales.length - 1 : 0);
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeMenu(true);
    }
  };

  const onOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = (index + 1) % locales.length;
    if (event.key === "ArrowUp") nextIndex = (index - 1 + locales.length) % locales.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = locales.length - 1;
    if (nextIndex !== null) {
      event.preventDefault();
      optionRefs.current[nextIndex]?.focus();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
    } else if (event.key === "Tab") {
      closeMenu();
    }
  };

  const menu = open && menuPosition ? (
    <div
      ref={menuRef}
      id={menuId}
      role="listbox"
      aria-label={locale === "tr" ? "Dil seçin" : "Choose language"}
      className="fixed z-[120] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 text-slate-900 shadow-2xl"
      style={{ left: menuPosition.left, top: menuPosition.top, width: MENU_WIDTH, maxHeight: menuPosition.maxHeight }}
    >
      {locales.map((item, index) => (
        <button
          key={item}
          ref={(node) => { optionRefs.current[index] = node; }}
          type="button"
          role="option"
          aria-selected={locale === item}
          onKeyDown={(event) => onOptionKeyDown(event, index)}
          onClick={() => {
            void setLocale(item as Locale);
            closeMenu(true);
          }}
          className={cn(
            "flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-xs outline-none hover:bg-orange-50 focus-visible:ring-2 focus-visible:ring-orange-500",
            locale === item && "bg-orange-50 font-semibold text-orange-700",
          )}
        >
          <span>{localeNames[item]}</span>
          {locale === item ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={locale === "tr" ? `Dil: ${localeNames[locale]}` : `Language: ${localeNames[locale]}`}
        className={cn(
          "flex min-h-11 items-center gap-1 rounded-xl border px-3 py-2 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2",
          dark ? "border-white/15 bg-white/5 text-white focus-visible:ring-offset-[#090d19]" : "bg-card",
        )}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onTriggerKeyDown}
      >
        <Languages className="size-4" aria-hidden="true" />
        {locale.toUpperCase()}
        <ChevronDown className={cn("size-3 opacity-60 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : null}
    </>
  );
}
