import { create } from "zustand";

import {
  getMobileNotifications,
  getMobileUnreadNotificationCount,
  markAllMobileNotificationsAsRead,
  markMobileNotificationAsRead,
  type MobileNotification
} from "@/api/mobileNotifications";
import { translateCurrent } from "@/i18n/runtime";

type NotificationState = {
  notifications: MobileNotification[];
  unreadCount: number;
  nextCursor: string | null;
  hasMore: boolean;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  setUnreadCount: (count: number) => void;
  loadNotifications: (options?: { refresh?: boolean }) => Promise<void>;
  loadMore: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  markLocalAsRead: (id: string) => void;
  markAllLocalAsRead: () => void;
  reset: () => void;
};

const initialState = {
  notifications: [],
  unreadCount: 0,
  nextCursor: null,
  hasMore: false,
  loading: false,
  refreshing: false,
  loadingMore: false,
  error: null
};

export const useNotificationStore = create<NotificationState>((set, get) => ({
  ...initialState,
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  loadNotifications: async (options) => {
    const refresh = options?.refresh ?? false;
    set({ loading: !refresh, refreshing: refresh, error: null });
    try {
      const [listResponse, countResponse] = await Promise.all([
        getMobileNotifications({ limit: 20 }),
        getMobileUnreadNotificationCount()
      ]);
      set({
        notifications: listResponse.notifications.map(normalizeNotification),
        unreadCount: countResponse.unreadCount,
        nextCursor: listResponse.pageInfo.nextCursor,
        hasMore: listResponse.pageInfo.hasMore,
        loading: false,
        refreshing: false,
        error: null
      });
    } catch (error) {
      set({ loading: false, refreshing: false, error: error instanceof Error ? error.message : translateCurrent("notificationsLoadFailed") });
    }
  },
  loadMore: async () => {
    const { hasMore, nextCursor, loadingMore } = get();
    if (!hasMore || !nextCursor || loadingMore) return;
    set({ loadingMore: true, error: null });
    try {
      const response = await getMobileNotifications({ cursor: nextCursor, limit: 20 });
      set((state) => ({
        notifications: [...state.notifications, ...response.notifications.map(normalizeNotification)],
        nextCursor: response.pageInfo.nextCursor,
        hasMore: response.pageInfo.hasMore,
        loadingMore: false
      }));
    } catch (error) {
      set({ loadingMore: false, error: error instanceof Error ? error.message : translateCurrent("notificationsLoadMoreFailed") });
    }
  },
  refreshUnreadCount: async () => {
    try {
      const response = await getMobileUnreadNotificationCount();
      set({ unreadCount: response.unreadCount });
    } catch {
      // Badge refresh should not interrupt active screens.
    }
  },
  markAsRead: async (id) => {
    const notification = get().notifications.find((item) => item.id === id);
    if (notification?.isRead) return;
    get().markLocalAsRead(id);
    try {
      await markMobileNotificationAsRead(id);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : translateCurrent("notificationUpdateFailed") });
      await get().refreshUnreadCount();
    }
  },
  markAllAsRead: async () => {
    get().markAllLocalAsRead();
    try {
      await markAllMobileNotificationsAsRead();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : translateCurrent("notificationsUpdateFailed") });
      await get().loadNotifications({ refresh: true });
    }
  },
  markLocalAsRead: (id) =>
    set((state) => {
      const notification = state.notifications.find((item) => item.id === id);
      return {
        notifications: state.notifications.map((item) => (item.id === id ? { ...item, isRead: true, read: true } : item)),
        unreadCount: notification && !notification.isRead ? Math.max(0, state.unreadCount - 1) : state.unreadCount
      };
    }),
  markAllLocalAsRead: () => set((state) => ({ notifications: state.notifications.map((item) => ({ ...item, isRead: true, read: true })), unreadCount: 0 })),
  reset: () => set(initialState)
}));

function normalizeNotification(notification: MobileNotification): MobileNotification {
  const isRead = notification.isRead ?? Boolean(notification.read);
  return { ...notification, isRead, read: notification.read ?? isRead };
}
