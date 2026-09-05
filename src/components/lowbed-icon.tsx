import type { HTMLAttributes } from "react";

export type LowbedIconProps = HTMLAttributes<HTMLSpanElement> & {
  width?: number;
  height?: number;
  title?: string;
};

/** The supplied silhouette uses the same currentColor as other menu icons. */
export function LowbedIcon({
  title,
  width = 42,
  height = 14,
  style,
  ...props
}: LowbedIconProps) {
  const label = title?.trim() || "";

  return (
    <span
      {...props}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      draggable={false}
      style={{ width, height, display: "inline-block", flexShrink: 0, backgroundColor: "currentColor",
        mask: 'url("/logivya/project-haul-icon-transparent.png") center / contain no-repeat',
        WebkitMask: 'url("/logivya/project-haul-icon-transparent.png") center / contain no-repeat', ...style }}
    />
  );
}
