import { SupportStablePage } from "@/components/support-stable-page";

export default async function Page({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <SupportStablePage initialPublicId={publicId} />;
}
