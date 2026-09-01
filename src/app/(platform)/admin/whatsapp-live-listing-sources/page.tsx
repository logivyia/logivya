import { AdminWhatsAppIngestion } from "@/components/admin-whatsapp-ingestion";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import {
  listWhatsAppIngestionGroups,
  listWhatsAppIngestionReview,
  whatsappIngestionHealth,
} from "@/server/whatsapp-ingestion/admin";

export const dynamic = "force-dynamic";

export default async function Page() {
  const admin = await requirePlatformAdmin("admin.whatsappIngestion.read");
  const [groups, health, review] = await Promise.all([
    listWhatsAppIngestionGroups({ ownerUserId: admin.user.id, limit: 200 }),
    whatsappIngestionHealth(admin.user.id),
    listWhatsAppIngestionReview({ ownerUserId: admin.user.id, limit: 50 }),
  ]);
  return (
    <AdminWhatsAppIngestion
      initialGroups={JSON.parse(JSON.stringify(groups.groups))}
      initialHealth={JSON.parse(JSON.stringify(health))}
      initialReview={JSON.parse(JSON.stringify(review.review))}
    />
  );
}
