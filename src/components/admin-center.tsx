import { AdminInteractiveTable } from "./admin-interactive-table";
import { AdminMetricCard } from "./admin-metric-card";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Database,
  FileText,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";

const icons = [
  Activity,
  Users,
  ShieldCheck,
  CircleDollarSign,
  FileText,
  Database,
  AlertTriangle,
  CheckCircle2,
];

export function AdminCenter({
  eyebrow,
  title,
  description,
  metrics,
  metricLinks = {},
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  metrics: Record<string, string | number>;
  metricLinks?: Record<string, string>;
  children?: React.ReactNode;
}) {
  return (
    <>
      <header className="mb-6 md:mb-7">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-orange-600">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          {description}
        </p>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Object.entries(metrics).map(([label, value], index) => {
          const Icon = icons[index % icons.length];
          return (
            <AdminMetricCard key={label} label={label} value={value} href={metricLinks[label]} description={description} recordsAvailable={Boolean(children)}><Icon aria-hidden className="size-5 text-orange-500" /></AdminMetricCard>
          );
        })}
      </div>
      {children ? <div id="admin-records" className="mt-6 scroll-mt-24">{children}</div> : null}
    </>
  );
}

export function AdminTable({
  headers,
  rows,
  emptyLabel = "-",
}: {
  headers: string[];
  rows: (string | number | null | undefined)[][];
  emptyLabel?: string;
}) {
  return <AdminInteractiveTable headers={headers} rows={rows} emptyLabel={emptyLabel} />;
}

export function AdminPagination({
  page,
  pages,
  previousLabel,
  nextLabel,
  pageLabel,
  query = {},
}: {
  page: number;
  pages: number;
  previousLabel: string;
  nextLabel: string;
  pageLabel: string;
  query?: Record<string, string>;
}) {
  if (pages <= 1) return null;
  const pageHref = (value: number) => `?${new URLSearchParams({ ...query, page: String(value) })}`;
  const linkClass =
    "inline-flex min-h-10 items-center justify-center rounded-xl border bg-white px-4 text-xs font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200";
  return (
    <nav
      aria-label={pageLabel}
      className="mt-4 flex items-center justify-center gap-3"
    >
      {page > 1 ? (
        <Link className={linkClass} href={pageHref(page - 1)}>
          {previousLabel}
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className={`${linkClass} cursor-not-allowed opacity-40`}
        >
          {previousLabel}
        </span>
      )}
      <span className="text-xs text-slate-500">
        {pageLabel}: {page} / {pages}
      </span>
      {page < pages ? (
        <Link className={linkClass} href={pageHref(page + 1)}>
          {nextLabel}
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className={`${linkClass} cursor-not-allowed opacity-40`}
        >
          {nextLabel}
        </span>
      )}
    </nav>
  );
}
