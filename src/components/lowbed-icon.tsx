import type { SVGProps } from "react";

export type LowbedIconProps = SVGProps<SVGSVGElement> & {
  title?: string;
};

/**
 * Original LOGIVYA lowbed / multi-axle heavy-haul outline.
 * It inherits currentColor so navigation active, inactive, light, and dark
 * states can be controlled by the parent just like the existing icon set.
 */
export function LowbedIcon({ title, width = 28, height = 22, ...props }: LowbedIconProps) {
  const labelled = Boolean(title?.trim());
  return (
    <svg
      {...props}
      width={width}
      height={height}
      viewBox="0 0 36 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={labelled ? "img" : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
    >
      {labelled ? <title>{title}</title> : null}
      <path d="M2 8.5v7.25h20.25l2.25-5.5h3.25l2.75 2.25H34v3.25h-1.75" />
      <path d="M2 12.75h18.75l1.5-3.75" />
      <path d="M24.5 10.25V6.5h4.25l2.75 6" />
      <path d="M27.5 8.25h2.1" />
      <path d="M4.25 15.75h26.5" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="13" cy="18" r="2" />
      <circle cx="19" cy="18" r="2" />
      <circle cx="29.5" cy="18" r="2" />
      <path d="M2 8.5h2.75l1.5 2" />
    </svg>
  );
}
