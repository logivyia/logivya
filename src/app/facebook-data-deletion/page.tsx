import type { Metadata } from "next";

import { getServerTranslator } from "@/i18n/server";
import { prisma } from "@/server/db";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return {
    title: `${t("facebookDeletion.title")} | LOGIVYA`,
    robots: { index: false, follow: false },
  };
}

export default async function FacebookDataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { t } = await getServerTranslator();
  const code = (await searchParams).code?.trim() || "";
  const request = code.length >= 8 ? await prisma.dataSubjectRequest.findUnique({
    where: { publicId: code },
    select: { publicId: true, status: true, completedAt: true },
  }) : null;
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-20">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-500">LOGIVYA</p>
      <h1 className="mt-4 text-3xl font-bold">{t("facebookDeletion.title")}</h1>
      {request ? (
        <div className="mt-8 rounded-2xl border p-6">
          <p><strong>{t("facebookDeletion.confirmationCode")}:</strong> {request.publicId}</p>
          <p className="mt-2"><strong>{t("common.status")}:</strong> {request.status === "COMPLETED" ? t("dataRequest.status.completed") : t("dataRequest.status.processing")}</p>
          <p className="mt-4 text-sm text-neutral-600">{t("facebookDeletion.success")}</p>
        </div>
      ) : (
        <p className="mt-8 rounded-2xl border p-6">{t("facebookDeletion.notFound")}</p>
      )}
    </main>
  );
}
