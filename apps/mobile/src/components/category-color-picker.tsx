import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors } from "@/theme/colors";
import { useTranslation } from "@/i18n/use-translation";
import type { TranslationKey } from "@/i18n/translations";
import { useTheme } from "@/theme/theme-provider";

export const DEFAULT_CATEGORY_COLOR = "#ff6b00";

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const CATEGORY_COLOR_PRESETS = [
  { labelKey: "colorOrange", value: "#ff6b00" },
  { labelKey: "colorBlue", value: "#2563eb" },
  { labelKey: "colorGreen", value: "#16a34a" },
  { labelKey: "colorRed", value: "#dc2626" },
  { labelKey: "colorPurple", value: "#7c3aed" },
  { labelKey: "colorYellow", value: "#eab308" },
  { labelKey: "colorGray", value: "#64748b" },
  { labelKey: "colorBlack", value: "#111827" }
] satisfies ReadonlyArray<{ labelKey: TranslationKey; value: string }>;

export function isValidCategoryColor(value: string | null | undefined) {
  return Boolean(value?.trim() && HEX_COLOR_PATTERN.test(value.trim()));
}

export function normalizeCategoryColor(value: string | null | undefined) {
  const color = value?.trim();
  return color && HEX_COLOR_PATTERN.test(color) ? color.toLowerCase() : DEFAULT_CATEGORY_COLOR;
}

export function CategoryColorPicker({
  value,
  onChange,
  label,
  changeLabel,
  selectedLabel,
  optionsLabel
}: {
  value: string | null | undefined;
  onChange: (color: string) => void;
  label: string;
  changeLabel: string;
  selectedLabel: string;
  optionsLabel: string;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selectedColor = normalizeCategoryColor(value);

  const selectColor = (nextColor: string) => {
    onChange(normalizeCategoryColor(nextColor));
    setOpen(false);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={changeLabel}
        onPress={() => setOpen(true)}
        style={[styles.previewButton, { backgroundColor: theme.input, borderColor: theme.border }]}
      >
        <View style={[styles.preview, { backgroundColor: selectedColor, borderColor: theme.border }]} />
        <View style={styles.previewCopy}>
          <Text style={[styles.selectedLabel, { color: theme.text }]}>{selectedLabel}</Text>
          <Text style={[styles.selectedValue, { color: theme.muted }]}>{selectedColor}</Text>
        </View>
        <View style={[styles.changePill, { backgroundColor: theme.badge }]}>
          <Text style={[styles.changeText, { color: theme.primary }]}>{changeLabel}</Text>
        </View>
      </Pressable>
      <View style={styles.inlinePresets}>
        {CATEGORY_COLOR_PRESETS.map((preset) => (
          <ColorSwatch key={preset.value} active={preset.value === selectedColor} name={t(preset.labelKey)} value={preset.value} onPress={() => onChange(preset.value)} />
        ))}
      </View>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{label}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={t("close")} onPress={() => setOpen(false)} style={styles.closeButton}>
                <Ionicons name="close" size={22} color={theme.icon} />
              </Pressable>
            </View>
            <Text style={[styles.optionsLabel, { color: theme.muted }]}>{optionsLabel}</Text>
            <ScrollView contentContainerStyle={styles.modalGrid}>
              {CATEGORY_COLOR_PRESETS.map((preset) => (
                <ColorOption key={preset.value} active={preset.value === selectedColor} name={t(preset.labelKey)} value={preset.value} onPress={() => selectColor(preset.value)} />
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function ColorSwatch({ active, name, value, onPress }: { active: boolean; name: string; value: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ selected: active }} onPress={onPress} style={[styles.swatch, { backgroundColor: value }, active ? styles.swatchActive : null]}>
      {active ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
    </Pressable>
  );
}

function ColorOption({ active, name, value, onPress }: { active: boolean; name: string; value: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ selected: active }} onPress={onPress} style={[styles.optionButton, { borderColor: active ? theme.primary : theme.border }]}>
      <View style={[styles.optionPreview, { backgroundColor: value }]}>{active ? <Ionicons name="checkmark" size={20} color={colors.white} /> : null}</View>
      <Text style={[styles.optionText, { color: theme.text }]}>{name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10
  },
  label: {
    fontSize: 13,
    fontWeight: "900"
  },
  previewButton: {
    minHeight: 76,
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  preview: {
    width: 52,
    height: 52,
    borderRadius: 18,
    borderWidth: 1
  },
  previewCopy: {
    flex: 1,
    gap: 3
  },
  selectedLabel: {
    fontSize: 15,
    fontWeight: "900"
  },
  selectedValue: {
    fontSize: 12,
    fontWeight: "700"
  },
  changePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  changeText: {
    fontSize: 12,
    fontWeight: "900"
  },
  inlinePresets: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  swatchActive: {
    borderWidth: 3,
    borderColor: colors.white
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(2, 6, 23, 0.48)",
    padding: 18
  },
  modalCard: {
    maxHeight: "76%",
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 14
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900"
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center"
  },
  optionsLabel: {
    fontSize: 13,
    fontWeight: "800"
  },
  modalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 6
  },
  optionButton: {
    width: "47%",
    minHeight: 86,
    borderWidth: 1,
    borderRadius: 18,
    padding: 10,
    gap: 8
  },
  optionPreview: {
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  optionText: {
    fontSize: 13,
    fontWeight: "900"
  }
});
