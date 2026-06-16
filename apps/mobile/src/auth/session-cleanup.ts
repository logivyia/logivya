import { useAuthStore } from "@/auth/auth-store";
import { useCategoriesStore } from "@/features/categories/categoriesStore";
import { useDashboardStore } from "@/features/dashboard/dashboardStore";
import { useGroupsStore } from "@/features/groups/groupsStore";
import { useNotificationStore } from "@/features/notifications/notificationStore";
import { useProfileStore } from "@/features/profile/profileStore";
import { useSubscriptionStore } from "@/features/subscription/subscriptionStore";
import { useSupportStore } from "@/features/support/supportStore";
import { useWhatsAppStore } from "@/features/whatsapp/whatsappStore";
import { queryClient } from "@/services/offline-query";
import { clearTokens } from "@/storage/secure-storage";

export async function clearMobileSessionState() {
  await clearTokens();

  queryClient.clear();
  useDashboardStore.getState().reset();
  useNotificationStore.getState().reset();
  useProfileStore.getState().reset();
  useSubscriptionStore.getState().reset();
  useSupportStore.getState().reset();
  useWhatsAppStore.getState().reset();
  useGroupsStore.getState().reset();
  useCategoriesStore.getState().reset();
  useAuthStore.getState().clearSession();
}
