import { DemandMatchesPage } from "@/components/marketplace/demand-matches-page";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DemandMatchesPage id={id} />;
}
