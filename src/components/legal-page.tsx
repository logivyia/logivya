import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function LegalPage({ title, versionLabel, children }: { title: string; versionLabel: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f8fafc] p-6">
      <article className="mx-auto max-w-4xl rounded-3xl border bg-white p-8 shadow-xl md:p-12">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Logivya
        </Link>
        <h1 className="mt-8 text-4xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted">{versionLabel}</p>
        <div className="mt-8 space-y-5 text-sm leading-7 text-slate-700">{children}</div>
      </article>
    </main>
  );
}
