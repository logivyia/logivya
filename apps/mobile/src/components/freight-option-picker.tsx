import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

type Option<T extends string> = { value: T; label: string };

export function FreightOptionPicker<T extends string>({
  label,
  value,
  placeholder,
  options,
  open,
  onOpen,
  onClose,
  onChange,
  error,
}: {
  label: string;
  value: T | null;
  placeholder: string;
  options: Array<Option<T>>;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (value: T) => void;
  error?: string | undefined;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const selected = options.find((option) => option.value === value);

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onOpen}
        style={[styles.control, { backgroundColor: theme.input, borderColor: error ? theme.danger : theme.border }]}
      >
        <Text style={[styles.value, { color: selected ? theme.text : theme.muted }]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={20} color={theme.iconMuted} />
      </Pressable>
      {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}

      <Modal animationType="slide" presentationStyle="pageSheet" visible={open} onRequestClose={onClose}>
        <SafeAreaView style={[styles.modal, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{label}</Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Text style={[styles.closeText, { color: theme.primary }]}>{t("cancel")}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.options}>
            {options.map((option) => {
              const active = option.value === value;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={option.value}
                  onPress={() => {
                    onChange(option.value);
                    onClose();
                  }}
                  style={[styles.option, { backgroundColor: active ? theme.badge : theme.card, borderColor: active ? theme.primary : theme.border }]}
                >
                  <Text style={[styles.optionText, { color: active ? theme.primary : theme.text }]}>{option.label}</Text>
                  {active ? <Ionicons name="checkmark-circle" size={22} color={theme.primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: "800" },
  control: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 54, paddingHorizontal: 16 },
  value: { flex: 1, fontSize: 16 },
  error: { fontSize: 12, fontWeight: "700" },
  modal: { flex: 1 },
  modalHeader: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", padding: 18 },
  modalTitle: { flex: 1, fontSize: 20, fontWeight: "900" },
  closeButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 10 },
  closeText: { fontSize: 15, fontWeight: "900" },
  options: { gap: 10, padding: 18 },
  option: { alignItems: "center", borderRadius: 16, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 58, paddingHorizontal: 16 },
  optionText: { flex: 1, fontSize: 15, fontWeight: "800" },
});
