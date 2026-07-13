import { useCallback, useMemo } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { Badge, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { useCategoriesStore } from "@/features/categories/categoriesStore";
import { useGroupsStore } from "@/features/groups/groupsStore";
import { useWhatsAppStore } from "@/features/whatsapp/whatsappStore";
import { useTranslation } from "@/i18n/use-translation";
import { formatDate, formatNumber } from "@/i18n/format";
import { useTheme } from "@/theme/theme-provider";
import type { MobileGroup } from "@/api/mobileGroups";

export function GroupsScreen() {
  const theme = useTheme();
  const { locale, t } = useTranslation();
  const { groups, filters, loading, refreshing, error, load, refresh, setSearch, setAccountFilter, setCategoryFilter, clearFilters } = useGroupsStore();
  const categories = useCategoriesStore((state) => state.categories);
  const loadCategories = useCategoriesStore((state) => state.load);
  const accounts = useWhatsAppStore((state) => state.accounts);
  const loadAccounts = useWhatsAppStore((state) => state.load);

  useFocusEffect(
    useCallback(() => {
      void load();
      void loadCategories();
      void loadAccounts();
    }, [load, loadAccounts, loadCategories])
  );

  const filteredGroups = useMemo(() => {
    return groups.filter((group) => {
      const accountMatches = !filters.accountId || group.accountId === filters.accountId;
      const categoryMatches = !filters.categoryId || group.categories.some((item) => item.category.id === filters.categoryId);
      return accountMatches && categoryMatches;
    });
  }, [filters.accountId, filters.categoryId, groups]);
  const sendableCount = filteredGroups.filter((group) => group.canSend).length;
  const memberCount = filteredGroups.reduce((total, group) => total + (group.participantCount ?? 0), 0);

  if (loading && !refreshing && groups.length === 0) {
    return (
      <Screen>
        <LoadingState label={t("loadingGroups")} />
      </Screen>
    );
  }

  if (error && groups.length === 0) {
    return (
      <Screen>
        <ErrorState title={error} onRetry={load} />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <FlatList
        data={filteredGroups}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader eyebrow={t("groupsEyebrow")} title={t("groupsTitle")} description={t("groupsSubtitle")} />
            <View style={styles.summaryGrid}>
              <StatCard icon="albums-outline" label={t("totalGroups")} value={filteredGroups.length} />
              <StatCard icon="people-outline" label={t("members")} value={memberCount} />
              <StatCard icon="send-outline" label={t("sendableMetric")} value={sendableCount} tone="success" />
            </View>
            <TextField label={t("searchGroups")} value={filters.search} onChangeText={setSearch} placeholder={t("searchGroupsPlaceholder")} returnKeyType="search" onSubmitEditing={load} />
            <Pressable
              accessibilityRole="button"
              disabled={refreshing}
              onPress={refresh}
              style={[styles.refreshButton, { backgroundColor: theme.primary, opacity: refreshing ? 0.7 : 1 }]}
            >
              <Text style={[styles.refreshButtonText, { color: theme.primaryText }]}>
                {refreshing ? t("refreshingGroups") : t("refreshGroups")}
              </Text>
            </Pressable>
            <FilterRow
              label={t("filterByAccount")}
              items={[
                { id: null, label: t("allAccounts") },
                ...accounts.map((account) => ({
                  id: account.id,
                  label: account.label || account.displayName || account.phoneNumber || t("unknown")
                }))
              ]}
              selectedId={filters.accountId}
              onSelect={setAccountFilter}
            />
            <FilterRow
              label={t("filterByCategory")}
              items={[{ id: null, label: t("allCategories") }, ...categories.map((category) => ({ id: category.id, label: category.name }))]}
              selectedId={filters.categoryId}
              onSelect={setCategoryFilter}
            />
            {(filters.accountId || filters.categoryId || filters.search) ? (
              <Pressable accessibilityRole="button" onPress={clearFilters}>
                <Text style={[styles.clear, { color: theme.primary }]}>{t("clearFilters")}</Text>
              </Pressable>
            ) : null}
            <SectionTitle title={t("groupList")} />
          </View>
        }
        ListEmptyComponent={<EmptyState title={t("noGroupsFound")} description={t("noGroupsFoundDescription")} />}
        renderItem={({ item }) => <GroupCard group={item} locale={locale} />}
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

function FilterRow({
  label,
  items,
  selectedId,
  onSelect
}: {
  label: string;
  items: { id: string | null; label: string }[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.filterBlock}>
      <Text style={[styles.filterLabel, { color: theme.text }]}>{label}</Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => item.id ?? "all"}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => {
          const active = item.id === selectedId;
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSelect(item.id)}
              style={[styles.chip, { backgroundColor: active ? theme.primary : theme.card, borderColor: active ? theme.primary : theme.border }]}
            >
              <Text style={[styles.chipText, { color: active ? theme.primaryText : theme.text }]}>{item.label}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function GroupCard({ group, locale }: { group: MobileGroup; locale: ReturnType<typeof useTranslation>["locale"] }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const accounts = useWhatsAppStore((state) => state.accounts);
  const account = accounts.find((item) => item.id === group.accountId);
  const accountName = account?.label || account?.displayName || account?.phoneNumber || t("unknown");

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{group.name || t("unknown")}</Text>
          <Text style={[styles.cardMeta, { color: theme.muted }]}>{accountName}</Text>
        </View>
        <Badge label={group.canSend ? t("sendable") : t("notSendable")} tone={group.canSend ? "success" : "danger"} />
      </View>
      <View style={styles.statsRow}>
        <Text style={[styles.stat, { color: theme.text }]}>
          {formatNumber(group.participantCount ?? 0, locale)} <Text style={{ color: theme.muted }}>{t("members")}</Text>
        </Text>
        <Text style={[styles.stat, { color: theme.text }]}>
          {group.categories.length} <Text style={{ color: theme.muted }}>{t("categories")}</Text>
        </Text>
      </View>
      {group.categories.length ? (
        <View style={styles.categoryRow}>
          {group.categories.map((item) => (
            <View key={item.category.id} style={[styles.categoryBadge, { backgroundColor: item.category.color || theme.primary }]}>
              <Text style={[styles.categoryBadgeText, { color: theme.primaryText }]}>{item.category.name}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={[styles.cardMeta, { color: theme.muted }]}>
        {t("lastSync")}: {group.lastSyncedAt ? formatDate(group.lastSyncedAt, locale) : t("unknown")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
    paddingVertical: 16
  },
  list: {
    gap: 14,
    paddingBottom: 32
  },
  header: {
    gap: 14,
    marginBottom: 4
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 3,
    textTransform: "uppercase"
  },
  title: {
    fontSize: 30,
    fontWeight: "900"
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22
  },
  filterBlock: {
    gap: 8
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: "800"
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginRight: 8
  },
  chipText: {
    fontSize: 13,
    fontWeight: "800"
  },
  clear: {
    fontSize: 14,
    fontWeight: "800"
  },
  refreshButton: {
    alignItems: "center",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: "900"
  },
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 14
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  cardTitleBlock: {
    flex: 1,
    gap: 4
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: "900"
  },
  cardMeta: {
    fontSize: 13,
    lineHeight: 19
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start"
  },
  statusText: {
    fontSize: 12,
    fontWeight: "900"
  },
  statsRow: {
    flexDirection: "row",
    gap: 18
  },
  stat: {
    fontSize: 15,
    fontWeight: "900"
  },
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  categoryBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: "900"
  }
});
