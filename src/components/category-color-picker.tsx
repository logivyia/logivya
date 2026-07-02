"use client";

import { useId, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";

import { cn } from "@/lib/utils";

const DEFAULT_CATEGORY_COLOR = "#ff6b00";
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const COLOR_PRESETS = [
  { name: "Orange", value: "#ff6b00" },
  { name: "Blue", value: "#2563eb" },
  { name: "Green", value: "#16a34a" },
  { name: "Red", value: "#dc2626" },
  { name: "Purple", value: "#7c3aed" },
  { name: "Yellow", value: "#eab308" },
  { name: "Gray", value: "#64748b" },
  { name: "Black", value: "#111827" }
] as const;

function normalizeColor(value: string | null | undefined) {
  const color = value?.trim();
  return color && HEX_COLOR_PATTERN.test(color) ? color.toLowerCase() : DEFAULT_CATEGORY_COLOR;
}

export function CategoryColorPicker({
  name = "color",
  defaultValue,
  label,
  changeLabel,
  selectedLabel,
  className
}: {
  name?: string;
  defaultValue?: string | null;
  label: string;
  changeLabel: string;
  selectedLabel?: string;
  className?: string;
}) {
  const inputId = useId();
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [selectedColor, setSelectedColor] = useState(() => normalizeColor(defaultValue));

  return (
    <div className={cn("grid gap-3", className)}>
      <input type="hidden" name={name} value={selectedColor} />
      <input
        ref={colorInputRef}
        aria-label={changeLabel}
        id={inputId}
        type="color"
        value={selectedColor}
        onChange={(event) => setSelectedColor(normalizeColor(event.target.value))}
        className="sr-only"
      />
      <div className="flex flex-col gap-3 rounded-xl border bg-input p-3 sm:flex-row sm:items-center">
        <button
          type="button"
          aria-label={changeLabel}
          onClick={() => colorInputRef.current?.click()}
          className="grid size-16 shrink-0 place-items-center rounded-xl border shadow-sm"
          style={{ backgroundColor: selectedColor }}
        >
          <Palette className="size-5 text-white drop-shadow" />
        </button>
        <div className="min-w-0 flex-1">
          <label htmlFor={inputId} className="block text-xs font-semibold text-foreground">
            {label}
          </label>
          <p className="mt-1 text-xs text-muted">
            {selectedLabel ? `${selectedLabel}: ${selectedColor}` : selectedColor}
          </p>
        </div>
        <button type="button" onClick={() => colorInputRef.current?.click()} className="inline-flex items-center justify-center rounded-xl border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted-background">
          {changeLabel}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {COLOR_PRESETS.map((preset) => {
          const active = preset.value === selectedColor;
          return (
            <button
              key={preset.value}
              type="button"
              aria-label={`${label}: ${preset.name}`}
              aria-pressed={active}
              onClick={() => setSelectedColor(preset.value)}
              className={cn("grid aspect-square min-h-10 place-items-center rounded-xl border shadow-sm outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-primary", active && "ring-2 ring-primary")}
              style={{ backgroundColor: preset.value }}
            >
              {active ? <Check className="size-4 text-white drop-shadow" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
