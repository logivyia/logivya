import { notFound } from "next/navigation";

import { ListingDetailPage } from "@/components/marketplace/listing-detail-page";

const kinds = ["loads", "vehicles", "drivers"];

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string; id: string }>;
  searchParams: Promise<{ requestId?: string | string[] }>;
}) {
  const [{ kind, id }, query] = await Promise.all([params, searchParams]);
  if (!kinds.includes(kind) || !id || id.length > 100) notFound();
  const requestId = typeof query.requestId === "string" && query.requestId.length <= 100 ? query.requestId : undefined;
  return <ListingDetailPage kind={kind} id={id} requestId={requestId} />;
}
