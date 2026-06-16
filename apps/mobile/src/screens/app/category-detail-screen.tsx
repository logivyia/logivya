import { useCallback, useEffect, useMemo } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";

import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { useCategoriesStore } from "@/features/categories/categoriesStore";
import { useGroupsStore } from "@/features/groups/groupsStore";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { MobileGroup } from "@/api/mobileGroups";
import type { CategoriesStackParamList } from "@/types/navigation";

export function CategoryDetailScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const route = useRoute<RouteProp<CategoriesStackParamList, "CategoryDetail">>();
  const { categoryId } = route.params;
  const { groups, loading: groupsLoading, refreshing, error: groupsError, load: loadGroups, refresh } = useGroupsStore();
  const { categories, selectedCategory, assignmentGroupIds, saving, error, success, load: loadCategories, selectCategory, toggleAssignment, updateCategory, clearFeedback } = useCategoriesStore();

  const category = categories.find((item) => item.id === categoryId) ?? selectedCategory;

  useFocusEffect(
    useCallback(() => {
      void loadCategories();
      void loadGroups();
    }, [loadCategories, loadGroups])
  );

  useEffect(() => {
    const currentCategory = categories.find((item) => item.id === categoryId);
    const assignedIds = groups.filter((group) => group.categories.some((item) => item.category.id === categoryId)).map((group) => group.id);
    if (currentCategory) selectCategory(currentCategory, assignedIds);
  }, [categories, categoryId, groups, selectCategory]);

  useEffect(() => {
    return () => clearFeedback();
  }, [clearFeedback]);

  const assignedGroups = useMemo(() => groups.filter((group) => assignmentGroupIds.includes(group.id)), [assignmentGroupIds, groups]);

  const saveAssignments = async () => {
    if (!category) return;
    await updateCategory(category.id, { groupIds: assignmentGroupIds });
    await loadGroups();
  };

  if (groupsLoading && groups.length === 0) {
    return (
      <Screen>
        <LoadingState label={t("loadingGroups")} />
      </Screen>
    );
  }

  if (!category) {
    return (
      <Screen>
        <ErrorState title={t("categoryNotFound")} onRetry={loadCategories} />
      </Screen>
    );
  }

  if (groupsError && groups.length === 0) {
    return (
      <Screen>
        <ErrorState title={groupsError} onRetry={loadGroups} />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={[styles.detailCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.detailTitleRow}>
                <View style={[styles.colorDot, { backgroundColor: category.color ?? theme.primary }]} />
                <Text style={[styles.title, { color: theme.text }]}>{category.name}</Text>
              </View>
              {category.description ? <Text style={[styles.subtitle, { color: theme.muted }]}>{category.description}</Text> : null}
              <Text style={[styles.meta, { color: theme.muted }]}>
                {assignedGroups.length} {t("assignedGroups")}
              </Text>
            </View>
            {error ? <Feedback text={error} tone="error" /> : null}
            {success ? <Feedback text={success} tone="success" /> : null}
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t("assignedGroups")}</Text>
            {assignedGroups.length ? (
              <View style={styles.assignedWrap}>
                {assignedGroups.map((group) => (
                  <View key={group.id} style={[styles.assignedPill, { backgroundColor: category.color ?? theme.primary }]}>
                    <Text style={styles.assignedPillText}>{group.name}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState title={t("noAssignedGroups")} description={t("noAssignedGroupsDescription")} />
            )}
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t("assignGroups")}</Text>
          </View>
        }
        ListEmptyComponent={<EmptyState title={t("noGroupsFound")} description={t("noGroupsFoundDescription")} />}
        renderItem={({ item }) => <AssignableGroup group={item} selected={assignmentGroupIds.includes(item.id)} onToggle={() => toggleAssignment(item.id)} />}
        ListFooterComponent={<PrimaryButton title={t("saveAssignments")} loading={saving} onPress={saveAssignments} disabled={groups.length === 0} />}
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

function AssignableGroup({ group, selected, onToggle }: { group: MobileGroup; selected: boolean; onToggle: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onToggle}
      style={[styles.groupCard, { backgroundColor: selected ? `${theme.primary}18` : theme.card, borderColor: selected ? theme.primary : theme.border }]}
    >
      <View style={[styles.checkbox, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primary : "transparent" }]}>
        <Text style={[styles.checkmark, { color: theme.primaryText }]}>{selected ? "✓" : ""}</Text>
      </View>
      <View style={styles.groupBody}>
        <Text style={[styles.groupTitle, { color: theme.text }]}>{group.name}</Text>
        <Text style={[styles.meta, { color: theme.muted }]}>
          {group.participantCount ?? 0} {t("members")} · {group.canSend ? t("sendable") : t("notSendable")}
        </Text>
      </View>
    </Pressable>
  );
}

function Feedback({ text, tone }: { text: string; tone: "success" | "error" }) {
  return (
    <View style={[styles.feedback, { backgroundColor: tone === "success" ? "#dcfce7" : "#fee2e2" }]}>
      <Text style={[styles.feedbackText, { color: tone === "success" ? "#047857" : "#b91c1c" }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
    paddingVertical: 16
  },
  list: {
    gap: 12,
    paddingBottom: 32
  },
  header: {
    gap: 14
  },
  detailCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 10
  },
  detailTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  colorDot: {
    width: 18,
    height: 18,
    borderRadius: 9
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    flex: 1
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22
  },
  meta: {
    fontSize: 13,
    fontWeight: "700"
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "900"
  },
  assignedWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  assignedPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  assignedPillText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  groupCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    gap: 12,
    alignItems: "center"
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center"
  },
  checkmark: {
    fontSize: 14,
    fontWeight: "900"
  },
  groupBody: {
    flex: 1,
    gap: 4
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: "900"
  },
  feedback: {
    borderRadius: 16,
    padding: 14
  },
  feedbackText: {
    fontSize: 14,
    fontWeight: "800"
  }
});
