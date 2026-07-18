import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import { getMobileCategoryContacts } from "@/api/mobileCategories";
import { getMobileContactDisplayName, getMobileContactPhoneLabel, getMobileContacts, syncMobileContacts, type MobileWhatsAppContact } from "@/api/mobileContacts";
import type { MobileGroup } from "@/api/mobileGroups";
import { getMobileSubscription } from "@/api/mobileSubscription";
import { CategoryColorPicker, DEFAULT_CATEGORY_COLOR, isValidCategoryColor, normalizeCategoryColor } from "@/components/category-color-picker";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { TextField } from "@/components/text-field";
import { useCategoriesStore } from "@/features/categories/categoriesStore";
import { useGroupsStore } from "@/features/groups/groupsStore";
import { useTranslation } from "@/i18n/use-translation";
import { formatNumber } from "@/i18n/format";
import { useTheme } from "@/theme/theme-provider";
import type { CategoriesStackParamList } from "@/types/navigation";

type CategoryContact = MobileWhatsAppContact & { assigned: boolean };
type ContactPageInfo = { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };

export function CategoryDetailScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const route = useRoute<RouteProp<CategoriesStackParamList, "CategoryDetail">>();
  const { categoryId } = route.params;
  const { groups, loading: groupsLoading, refreshing, error: groupsError, load: loadGroups, refresh } = useGroupsStore();
  const {
    categories,
    selectedCategory,
    assignmentGroupIds,
    saving,
    error,
    success,
    load: loadCategories,
    selectCategory,
    toggleAssignment,
    updateCategory,
    clearFeedback,
  } = useCategoriesStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_CATEGORY_COLOR);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [contactAccess, setContactAccess] = useState(false);
  const [contacts, setContacts] = useState<CategoryContact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactPageInfo, setContactPageInfo] = useState<ContactPageInfo | null>(null);
  const contactRequestVersion = useRef(0);
  const initializedContactCategoryId = useRef<string | null>(null);

  const category = selectedCategory ?? categories.find((item) => item.id === categoryId);

  useFocusEffect(
    useCallback(() => {
      void loadCategories();
      void loadGroups();
      void getMobileSubscription()
        .then((response) => setContactAccess(response.subscription.entitlements.contactMessaging))
        .catch(() => setContactAccess(false));
    }, [loadCategories, loadGroups]),
  );

  useEffect(() => {
    const currentCategory = categories.find((item) => item.id === categoryId);
    if (!currentCategory) return;
    const assignedIds = groups.filter((group) => group.categories.some((item) => item.category.id === categoryId)).map((group) => group.id);
    selectCategory(currentCategory, assignedIds);
    setName(currentCategory.name);
    setDescription(currentCategory.description ?? "");
    setColor(normalizeCategoryColor(currentCategory.color));
  }, [categories, categoryId, groups, selectCategory]);

  useEffect(() => () => clearFeedback(), [clearFeedback]);

  const loadContacts = useCallback(async (page = 1, append = false) => {
    if (!contactAccess) return;
    const requestVersion = ++contactRequestVersion.current;
    setContactLoading(true);
    setContactError(null);
    try {
      const response = await getMobileCategoryContacts(categoryId, { page, limit: 50, search: contactSearch });
      if (requestVersion !== contactRequestVersion.current) return;
      setContacts((current) => {
        if (!append) return response.contacts;
        const byId = new Map(current.map((contact) => [contact.id, contact]));
        for (const contact of response.contacts) byId.set(contact.id, contact);
        return [...byId.values()];
      });
      setContactPageInfo(response.pageInfo);
      if (initializedContactCategoryId.current !== categoryId) {
        setSelectedContactIds(response.assignedContactIds);
        initializedContactCategoryId.current = categoryId;
      }
    } catch (loadError) {
      if (requestVersion === contactRequestVersion.current) {
        setContactError(loadError instanceof Error ? loadError.message : t("contactsLoadFailed"));
      }
    } finally {
      if (requestVersion === contactRequestVersion.current) setContactLoading(false);
    }
  }, [categoryId, contactAccess, contactSearch, t]);

  useEffect(() => {
    if (!contactAccess) {
      contactRequestVersion.current += 1;
      setContacts([]);
      setSelectedContactIds([]);
      setContactPageInfo(null);
      return;
    }
    const timer = setTimeout(() => void loadContacts(1, false), 300);
    return () => clearTimeout(timer);
  }, [contactAccess, contactSearch, loadContacts]);

  const assignedGroups = useMemo(() => groups.filter((group) => assignmentGroupIds.includes(group.id)), [assignmentGroupIds, groups]);
  const availableGroups = useMemo(() => groups.filter((group) => !assignmentGroupIds.includes(group.id)), [assignmentGroupIds, groups]);
  const loadedAssignedContacts = useMemo(() => contacts.filter((contact) => selectedContactIds.includes(contact.id)), [contacts, selectedContactIds]);
  const loadedAssignableContacts = useMemo(() => contacts.filter((contact) => !selectedContactIds.includes(contact.id)), [contacts, selectedContactIds]);

  function toggleContact(contactId: string) {
    setSelectedContactIds((current) => current.includes(contactId) ? current.filter((id) => id !== contactId) : [...current, contactId]);
  }

  function toggleVisibleContacts() {
    const visibleIds = contacts.map((contact) => contact.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedContactIds.includes(id));
    setSelectedContactIds((current) => allSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : [...new Set([...current, ...visibleIds])]);
  }

  async function refreshContacts() {
    setContactLoading(true);
    setContactError(null);
    try {
      const syncRequest = await syncMobileContacts();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        const syncState = await getMobileContacts({ limit: 10 });
        if (syncState.syncRun?.id === syncRequest.syncRunId && ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(syncState.syncRun.status)) {
          if (syncState.syncRun.status === "FAILED") throw new Error(t("contactsRefreshFailed"));
          break;
        }
      }
      await loadContacts(1, false);
    } catch (refreshError) {
      setContactError(refreshError instanceof Error ? refreshError.message : t("contactsRefreshFailed"));
      setContactLoading(false);
    }
  }

  const saveCategory = async () => {
    if (!category) return;
    const normalizedName = name.trim();
    const normalizedColor = color.trim() || DEFAULT_CATEGORY_COLOR;
    if (!normalizedName) {
      setValidationError(t("categoryNameValidation"));
      return;
    }
    if (!isValidCategoryColor(normalizedColor)) {
      setValidationError(t("categoryColorValidation"));
      return;
    }
    setValidationError(null);
    const ok = await updateCategory(category.id, {
      name: normalizedName,
      description: description.trim() || null,
      color: normalizeCategoryColor(normalizedColor),
      groupIds: [...new Set(assignmentGroupIds)],
      ...(contactAccess ? { contactIds: [...new Set(selectedContactIds)] } : {}),
    });
    if (ok) await Promise.all([loadCategories(), loadGroups(), contactAccess ? loadContacts(1, false) : Promise.resolve()]);
  };

  if (groupsLoading && groups.length === 0) {
    return <Screen><LoadingState label={t("loadingGroups")} /></Screen>;
  }
  if (!category) {
    return <Screen><ErrorState title={t("categoryNotFound")} onRetry={loadCategories} /></Screen>;
  }
  if (groupsError && groups.length === 0) {
    return <Screen><ErrorState title={groupsError} onRetry={loadGroups} /></Screen>;
  }

  const audienceSummary = formatAudienceSummary(assignmentGroupIds.length, selectedContactIds.length, t);

  return (
    <Screen style={styles.screen}>
      <FlatList
        data={availableGroups}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={[styles.detailCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.detailTitleRow}>
                <View style={[styles.colorDot, { backgroundColor: color || category.color || theme.primary }]} />
                <Text style={[styles.title, { color: theme.text }]}>{name || category.name}</Text>
              </View>
              <Text style={[styles.meta, { color: theme.muted }]}>{audienceSummary}</Text>
            </View>

            {error ? <Feedback text={error} tone="error" /> : null}
            {success ? <Feedback text={success} tone="success" /> : null}
            {validationError ? <Feedback text={validationError} tone="error" /> : null}

            <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>{t("editCategory")}</Text>
              <TextField label={t("categoryName")} value={name} onChangeText={setName} />
              <TextField label={t("categoryDescription")} value={description} onChangeText={setDescription} multiline />
              <CategoryColorPicker
                value={color}
                onChange={setColor}
                label={t("categoryColor")}
                changeLabel={t("changeCategoryColor")}
                selectedLabel={t("selectedCategoryColor")}
                optionsLabel={t("categoryColorOptions")}
              />
            </View>

            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t("assignedGroupsTitle")}</Text>
            {assignedGroups.length ? (
              <View style={styles.assignedList}>
                {assignedGroups.map((group) => <AssignableGroup key={group.id} group={group} selected compact onToggle={() => toggleAssignment(group.id)} />)}
              </View>
            ) : <EmptyState title={t("noAssignedGroups")} description={t("noAssignedGroupsDescription")} />}

            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t("assignableGroups")}</Text>
            {!groups.length ? <EmptyState title={t("noAssignableGroups")} description={t("noAssignableGroupsDescription")} /> : null}
          </View>
        }
        ListEmptyComponent={groups.length ? <EmptyState title={t("allGroupsAssigned")} description={t("allGroupsAssignedDescription")} /> : null}
        renderItem={({ item }) => <AssignableGroup group={item} selected={false} onToggle={() => toggleAssignment(item.id)} />}
        ListFooterComponent={
          <View style={styles.footer}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>{t("contacts")}</Text>
                <Text style={[styles.meta, { color: theme.muted }]}>{t("contactsSelected", { count: selectedContactIds.length })}</Text>
              </View>
              {contactAccess ? (
                <Pressable accessibilityRole="button" disabled={contactLoading} onPress={() => void refreshContacts()} style={[styles.smallButton, { borderColor: theme.border, opacity: contactLoading ? 0.55 : 1 }]}>
                  <Ionicons name="refresh-outline" size={18} color={theme.primary} />
                  <Text style={[styles.smallButtonText, { color: theme.text }]}>{t("refresh")}</Text>
                </Pressable>
              ) : null}
            </View>
            {!contactAccess ? (
              <View style={[styles.lockedNotice, { borderColor: theme.border, backgroundColor: theme.badge }]}>
                <Ionicons name="lock-closed-outline" size={20} color={theme.primary} />
                <Text style={[styles.lockedText, { color: theme.text }]}>{t("contactCategoryProfessionalRequired")}</Text>
              </View>
            ) : (
              <>
                <View style={[styles.searchBox, { borderColor: theme.border, backgroundColor: theme.card }]}>
                  <Ionicons name="search-outline" size={18} color={theme.muted} />
                  <TextInput value={contactSearch} onChangeText={setContactSearch} placeholder={t("searchContacts")} placeholderTextColor={theme.muted} style={[styles.searchInput, { color: theme.text }]} />
                </View>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: contacts.length > 0 && contacts.every((contact) => selectedContactIds.includes(contact.id)) }} onPress={toggleVisibleContacts} style={[styles.selectVisibleRow, { borderColor: theme.border, backgroundColor: theme.card }]}>
                  <View style={[styles.checkbox, { borderColor: theme.primary, backgroundColor: contacts.length > 0 && contacts.every((contact) => selectedContactIds.includes(contact.id)) ? theme.primary : "transparent" }]}>
                    <Text style={[styles.checkmark, { color: theme.primaryText }]}>{contacts.length > 0 && contacts.every((contact) => selectedContactIds.includes(contact.id)) ? "✓" : ""}</Text>
                  </View>
                  <Text style={[styles.groupTitle, { color: theme.text }]}>{t("selectVisibleContacts")}</Text>
                </Pressable>

                <Text style={[styles.subsectionTitle, { color: theme.muted }]}>{t("assignedContacts")}</Text>
                {loadedAssignedContacts.length ? (
                  <View style={styles.contactList}>
                    {loadedAssignedContacts.map((contact) => <AssignableContact key={`assigned-${contact.id}`} contact={contact} selected onToggle={() => toggleContact(contact.id)} />)}
                  </View>
                ) : <Text style={[styles.meta, { color: theme.muted }]}>{t("noAssignedContactsInView")}</Text>}

                <Text style={[styles.subsectionTitle, { color: theme.muted }]}>{t("assignableContacts")}</Text>
                {contactError ? <Feedback text={contactError} tone="error" /> : null}
                {!contacts.length && contactLoading ? <LoadingState label={t("contactsLoading")} /> : loadedAssignableContacts.length ? (
                  <View style={styles.contactList}>
                    {loadedAssignableContacts.map((contact) => <AssignableContact key={contact.id} contact={contact} selected={false} onToggle={() => toggleContact(contact.id)} />)}
                  </View>
                ) : <EmptyState title={contacts.length ? t("allContactsAssigned") : t("contactNotFound")} description={contacts.length ? t("allVisibleContactsAssigned") : t("contactSearchHelp")} />}
                {contactPageInfo?.hasMore ? <PrimaryButton title={contactLoading ? t("contactsLoading") : t("loadMoreContacts")} disabled={contactLoading} onPress={() => void loadContacts(contactPageInfo.page + 1, true)} /> : null}
              </>
            )}
            <View style={[styles.saveBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.saveCount, { color: theme.text }]}>{audienceSummary}</Text>
              <PrimaryButton title={t("saveChanges")} loading={saving} onPress={saveCategory} />
            </View>
          </View>
        }
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

function AssignableGroup({ group, selected, compact, onToggle }: { group: MobileGroup; selected: boolean; compact?: boolean; onToggle: () => void }) {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onToggle} style={[styles.groupCard, { backgroundColor: selected ? `${theme.primary}18` : theme.card, borderColor: selected ? theme.primary : theme.border }]}>
      <SelectionBox selected={selected} />
      <View style={styles.groupBody}>
        <Text style={[styles.groupTitle, { color: theme.text }]}>{group.name}</Text>
        <Text style={[styles.meta, { color: theme.muted }]}>{compact ? t("tapToRemoveCategory") : `${formatNumber(group.participantCount ?? 0, locale)} ${t("members")} · ${group.canSend ? t("sendable") : t("notSendable")}`}</Text>
      </View>
    </Pressable>
  );
}

function AssignableContact({ contact, selected, onToggle }: { contact: CategoryContact; selected: boolean; onToggle: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const displayName = getMobileContactDisplayName(contact) ?? t("savedContact");
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onToggle} style={[styles.groupCard, { backgroundColor: selected ? `${theme.primary}18` : theme.card, borderColor: selected ? theme.primary : theme.border }]}>
      <SelectionBox selected={selected} />
      <View style={styles.groupBody}>
        <Text style={[styles.groupTitle, { color: theme.text }]} numberOfLines={2}>{displayName}</Text>
        {getMobileContactPhoneLabel(contact) ? <Text style={[styles.meta, { color: theme.muted }]}>{getMobileContactPhoneLabel(contact)}</Text> : null}
      </View>
    </Pressable>
  );
}

function SelectionBox({ selected }: { selected: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.checkbox, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primary : "transparent" }]}>
      <Text style={[styles.checkmark, { color: theme.primaryText }]}>{selected ? "✓" : ""}</Text>
    </View>
  );
}

function Feedback({ text, tone }: { text: string; tone: "success" | "error" }) {
  const theme = useTheme();
  const backgroundColor = tone === "success" ? theme.successSoft : theme.dangerSoft;
  const color = tone === "success" ? theme.success : theme.danger;
  return <View style={[styles.feedback, { backgroundColor }]}><Text style={[styles.feedbackText, { color }]}>{text}</Text></View>;
}

function formatAudienceSummary(groups: number, contacts: number, t: ReturnType<typeof useTranslation>["t"]) {
  if (groups && contacts) return `${t("groupMetric", { count: groups })} · ${t("contactMetric", { count: contacts })}`;
  if (groups) return t("groupMetric", { count: groups });
  if (contacts) return t("contactMetric", { count: contacts });
  return t("noAssignedAudience");
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  list: { gap: 12, paddingBottom: 96 },
  header: { gap: 14 },
  footer: { gap: 14, marginTop: 14 },
  detailCard: { borderWidth: 1, borderRadius: 8, padding: 18, gap: 10 },
  detailTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  colorDot: { width: 18, height: 18, borderRadius: 9 },
  title: { fontSize: 28, fontWeight: "900", flex: 1 },
  meta: { fontSize: 13, fontWeight: "700" },
  formCard: { borderWidth: 1, borderRadius: 8, padding: 18, gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "900" },
  subsectionTitle: { fontSize: 12, fontWeight: "900", textTransform: "uppercase", marginTop: 4 },
  assignedList: { gap: 10 },
  contactList: { gap: 10 },
  groupCard: { minHeight: 62, borderWidth: 1, borderRadius: 8, padding: 14, flexDirection: "row", gap: 12, alignItems: "center" },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  checkmark: { fontSize: 14, fontWeight: "900" },
  groupBody: { flex: 1, gap: 4 },
  groupTitle: { fontSize: 15, fontWeight: "900", flexShrink: 1 },
  feedback: { borderRadius: 8, padding: 14 },
  feedbackText: { fontSize: 14, fontWeight: "800" },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  smallButton: { minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  smallButtonText: { fontSize: 13, fontWeight: "800" },
  lockedNotice: { borderWidth: 1, borderRadius: 8, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  lockedText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  searchBox: { minHeight: 50, borderWidth: 1, borderRadius: 8, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1, minHeight: 48, fontSize: 15 },
  selectVisibleRow: { minHeight: 52, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  saveBar: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 10 },
  saveCount: { fontSize: 14, fontWeight: "900" },
});
