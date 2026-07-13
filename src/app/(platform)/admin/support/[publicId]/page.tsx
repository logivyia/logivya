import { AdminSupportPage } from "@/components/admin-support-page";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page({ params }: { params: Promise<{ publicId: string }> }) {
  await requirePlatformAdmin();
  const { publicId } = await params;
  return <AdminSupportPage initialPublicId={publicId} />;
}
