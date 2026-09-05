import { ListingDetailPage } from "@/components/marketplace/listing-detail-page";
export default async function ExploreDetail({ params }: { params: Promise<{ kind: string; id: string }> }) { const { kind, id } = await params; return <ListingDetailPage kind={kind} id={id} guest />; }
