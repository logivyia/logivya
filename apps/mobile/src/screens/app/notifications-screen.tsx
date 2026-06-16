import { useEffect } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { useNotificationStore } from "@/features/notifications/notificationStore";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { MobileNotification } from "@/api/mobileNotifications";

export function NotificationsScreen() {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const {
    notifications,
    unreadCount,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore,
    loadNotifications,
    loadMore,
    markAsRead,
    markAllAsRead
  } = useNotificationStore();

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const openNotification = (notification: MobileNotification) => {
    void markAsRead(notification.id);
    Alert.alert(notification.title, notification.message);
  };

  if (loading && notifications.length === 0) return <LoadingState label={t("loadingNotifications")} />;

  return (
    <Screen style={styles.screen}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={() => void loadNotifications({ refresh: true })}
        onEndReached={() => {
          if (hasMore) void loadMore();
        }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.summaryTop}>
              <View>
                <Text style={[styles.title, { color: theme.text }]}>{t("notifications")}</Text>
                <Text style={[styles.subtitle, { color: theme.muted }]}>{t("notificationsDescription")}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            </View>
            <PrimaryButton title={t("markAllAsRead")} onPress={() => void markAllAsRead()} disabled={unreadCount === 0} />
          </View>
        }
        ListEmptyComponent={
          error ? (
            <ErrorState title={error || t("notificationsLoadFailed")} onRetry={() => void loadNotifications({ refresh: true })} />
          ) : (
            <EmptyState title={t("noNotifications")} description={t("noNotificationsDescriptionReady")} />
          )
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.primary} style={styles.loader} /> : null}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => openNotification(item)}
            style={({ pressed }) => [
              styles.notificationCard,
              { backgroundColor: theme.card, borderColor: item.isRead ? theme.border : theme.primary },
              pressed ? styles.pressed : null
            ]}
          >
            <View style={styles.notificationHeader}>
              <View style={[styles.unreadDot, { backgroundColor: item.isRead ? theme.border : theme.primary }]} />
              <Text style={[styles.notificationTitle, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
              <Text style={[styles.date, { color: theme.muted }]}>{formatDate(item.createdAt, locale)}</Text>
            </View>
            <Text style={[styles.message, { color: theme.muted }]} numberOfLines={3}>{item.message}</Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  content: { gap: 14, paddingBottom: 32 },
  summaryCard: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 16 },
  summaryTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  title: { fontSize: 30, fontWeight: "900" },
  subtitle: { marginTop: 6, maxWidth: 250, fontSize: 15, lineHeight: 22 },
  badge: { minWidth: 42, height: 42, borderRadius: 21, backgroundColor: "#ff5a00", alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  badgeText: { color: "#ffffff", fontSize: 16, fontWeight: "900" },
  notificationCard: { borderWidth: 1, borderRadius: 22, padding: 16, gap: 10 },
  pressed: { opacity: 0.78 },
  notificationHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  unreadDot: { width: 10, height: 10, borderRadius: 5 },
  notificationTitle: { flex: 1, fontSize: 16, fontWeight: "900", lineHeight: 22 },
  date: { fontSize: 12, fontWeight: "700" },
  message: { fontSize: 14, lineHeight: 20 },
  loader: { paddingVertical: 18 }
});
