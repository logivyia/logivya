import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { PrimaryButton } from "@/components/primary-button";
import { CategoryColorPicker, DEFAULT_CATEGORY_COLOR, isValidCategoryColor, normalizeCategoryColor } from "@/components/category-color-picker";
import { Screen } from "@/components/screen";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { TextField } from "@/components/text-field";
import { PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { useCategoriesStore } from "@/features/categories/categoriesStore";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { MobileCategory } from "@/api/mobileCategories";
import type { CategoriesStackParamList } from "@/types/navigation";

type FormState = {
  id?: string;
  name: string;
  description: string;
  color: string;
};

const defaultForm: FormState = {
  name: "",
  description: "",
  color: DEFAULT_CATEGORY_COLOR
};

export function CategoriesScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<CategoriesStackParamList>>();
  const { categories, loading, refreshing, saving, deletingId, error, success, load, refresh, createCategory, updateCategory, deleteCategory, clearFeedback } = useCategoriesStore();
  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [formError, setFormError] = useState<string | null>(null);
  const assignedTargetsCount = categories.reduce(
    (total, category) => total + (category._count?.groups ?? 0) + (category._count?.contacts ?? 0),
    0,
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    return () => clearFeedback();
  }, [clearFeedback]);

  const startCreate = () => {
    setForm(defaultForm);
    setFormError(null);
    setFormVisible(true);
  };

  const startEdit = (category: MobileCategory) => {
    setFormVisible(false);
    setForm(defaultForm);
    setFormError(null);
    navigation.navigate("CategoryDetail", { categoryId: category.id });
  };

  const submit = async () => {
    const name = form.name.trim();
    const color = form.color.trim() || DEFAULT_CATEGORY_COLOR;
    if (name.length < 2) {
      setFormError(t("categoryNameValidation"));
      return;
    }
    if (!isValidCategoryColor(color)) {
      setFormError(t("categoryColorValidation"));
      return;
    }

    const ok = form.id
      ? await updateCategory(form.id, { name, description: form.description.trim() || null, color: normalizeCategoryColor(color) })
      : await createCategory({ name, description: form.description.trim() || undefined, color: normalizeCategoryColor(color) });

    if (ok) {
      setFormVisible(false);
      setForm(defaultForm);
    }
  };

  const confirmDelete = (category: MobileCategory) => {
    Alert.alert(t("deleteCategory"), t("deleteCategoryConfirmation"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("delete"), style: "destructive", onPress: () => void deleteCategory(category.id) }
    ]);
  };

  if (loading && !refreshing && categories.length === 0) {
    return (
      <Screen>
        <LoadingState label={t("loadingCategories")} />
      </Screen>
    );
  }

  if (error && categories.length === 0) {
    return (
      <Screen>
        <ErrorState title={error} onRetry={load} />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <FlatList
          data={categories}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />}
          keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
              <PageHeader eyebrow={t("categoriesEyebrow")} title={t("categoriesTitle")} description={t("categoriesSubtitle")} />
              <View style={styles.summaryGrid}>
                <StatCard icon="pricetags-outline" label={t("categoryDetail")} value={categories.length} />
                <StatCard icon="people-outline" label={t("assignedTargets")} value={assignedTargetsCount} tone="success" />
                <StatCard icon="color-palette-outline" label={t("segmentColor")} value={t("active")} tone="warning" />
              </View>
              {error ? <Feedback text={error} tone="error" /> : null}
              {success ? <Feedback text={success} tone="success" /> : null}
              {formVisible ? (
                <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.formTitle, { color: theme.text }]}>{form.id ? t("editCategory") : t("createCategory")}</Text>
                  <TextField label={t("categoryName")} value={form.name} onChangeText={(name) => setForm((state) => ({ ...state, name }))} />
                  <TextField label={t("categoryDescription")} value={form.description} onChangeText={(description) => setForm((state) => ({ ...state, description }))} multiline />
                  <CategoryColorPicker
                    value={form.color}
                    onChange={(color) => setForm((state) => ({ ...state, color }))}
                    label={t("categoryColor")}
                    changeLabel={t("changeCategoryColor")}
                    selectedLabel={t("selectedCategoryColor")}
                    optionsLabel={t("categoryColorOptions")}
                  />
                  {formError ? <Text style={[styles.validation, { color: theme.danger }]}>{formError}</Text> : null}
                  <View style={styles.formActions}>
                    <Pressable accessibilityRole="button" onPress={() => setFormVisible(false)} style={[styles.secondaryButton, { borderColor: theme.border }]}>
                      <Text style={[styles.secondaryButtonText, { color: theme.text }]}>{t("cancel")}</Text>
                    </Pressable>
                    <PrimaryButton title={form.id ? t("saveChanges") : t("createCategory")} loading={saving} onPress={submit} />
                  </View>
                </View>
              ) : (
                <PrimaryButton icon="add-outline" title={t("createCategory")} onPress={startCreate} />
              )}
              <SectionTitle title={t("categoryList")} />
            </View>
          }
          ListEmptyComponent={<EmptyState title={t("noCategoriesFound")} description={t("noCategoriesFoundDescription")} />}
          renderItem={({ item }) => (
            <CategoryCard
              category={item}
              deleting={deletingId === item.id}
              onOpen={() => navigation.navigate("CategoryDetail", { categoryId: item.id })}
              onEdit={() => startEdit(item)}
              onDelete={() => confirmDelete(item)}
            />
          )}
          contentContainerStyle={styles.list}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

function CategoryCard({
  category,
  deleting,
  onOpen,
  onEdit,
  onDelete
}: {
  category: MobileCategory;
  deleting: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Pressable accessibilityRole="button" onPress={onOpen} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.colorDot, { backgroundColor: category.color ?? theme.primary }]} />
        <View style={styles.cardTitleBlock}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{category.name}</Text>
          {category.description ? <Text style={[styles.cardDescription, { color: theme.muted }]}>{category.description}</Text> : null}
        </View>
      </View>
      <Text style={[styles.cardMeta, { color: theme.muted }]}>{formatCategoryAudience(category, t)}</Text>
      <View style={styles.cardActions}>
        <Pressable accessibilityRole="button" onPress={onEdit} style={[styles.actionButton, { borderColor: theme.border }]}>
          <Text style={[styles.actionButtonText, { color: theme.text }]}>{t("edit")}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={deleting} onPress={onDelete} style={[styles.actionButton, { borderColor: theme.border, opacity: deleting ? 0.6 : 1 }]}>
          <Text style={[styles.actionButtonText, { color: theme.danger }]}>{t("delete")}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function formatCategoryAudience(category: MobileCategory, t: ReturnType<typeof useTranslation>["t"]) {
  const groups = category.assignedGroupCount ?? category._count?.groups ?? 0;
  const contacts = category.assignedContactCount ?? category._count?.contacts ?? 0;
  if (groups && contacts) return `${t("groupMetric", { count: groups })} · ${t("contactMetric", { count: contacts })}`;
  if (groups) return t("groupMetric", { count: groups });
  if (contacts) return t("contactMetric", { count: contacts });
  return t("noAssignedAudience");
}

function Feedback({ text, tone }: { text: string; tone: "success" | "error" }) {
  const theme = useTheme();
  const backgroundColor = tone === "success" ? theme.successSoft : theme.dangerSoft;
  const color = tone === "success" ? theme.success : theme.danger;

  return (
    <View style={[styles.feedback, { backgroundColor }]}>
      <Text style={[styles.feedbackText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1
  },
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
  formCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 14
  },
  formTitle: {
    fontSize: 19,
    fontWeight: "900"
  },
  formActions: {
    gap: 10
  },
  secondaryButton: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "800"
  },
  validation: {
    fontSize: 13,
    fontWeight: "700"
  },
  feedback: {
    borderRadius: 16,
    padding: 14
  },
  feedbackText: {
    fontSize: 14,
    fontWeight: "800"
  },
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 14
  },
  cardHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start"
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginTop: 4
  },
  cardTitleBlock: {
    flex: 1,
    gap: 4
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: "900"
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 20
  },
  cardMeta: {
    fontSize: 13,
    fontWeight: "800"
  },
  cardActions: {
    flexDirection: "row",
    gap: 10
  },
  actionButton: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "900"
  }
});
