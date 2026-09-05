import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSettingsStore } from "@/auth/settings-store";
import { locales, localeMetadata } from "@/i18n/config";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

/** Local preference also works before the visitor has an account. */
export function LanguageSelector() {
  const [open, setOpen] = useState(false);
  const { locale, t } = useTranslation();
  const setLocale = useSettingsStore(state => state.setLocale);
  const theme = useTheme();
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={t("changeLanguage")} accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={[styles.button, { borderColor: theme.border, backgroundColor: theme.card }]}>
      <Ionicons name="language-outline" size={20} color={theme.text} /><Text style={{ color: theme.text, fontWeight: "800" }}>{locale.toUpperCase()}</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.overlay}><View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.heading}><Text style={{ color: theme.text, fontSize: 22, fontWeight: "800", flex: 1 }}>{t("language")}</Text><Pressable accessibilityRole="button" accessibilityLabel={t("close")} onPress={() => setOpen(false)} style={styles.close}><Ionicons name="close" size={26} color={theme.text} /></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>{locales.map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: value === locale }} onPress={() => { setLocale(value); setOpen(false); }} style={[styles.option, { borderColor: value === locale ? theme.primary : theme.border, backgroundColor: value === locale ? theme.badge : theme.cardMuted }]}><Text style={{ color: theme.text, flex: 1, fontSize: 17, fontWeight: "700", writingDirection: localeMetadata[value].direction }}>{localeMetadata[value].nativeName}</Text>{value === locale ? <Ionicons name="checkmark-circle" size={24} color={theme.primary} /> : null}</Pressable>)}</ScrollView>
      </View></View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({ button: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", minHeight: 44, paddingHorizontal: 10, borderWidth: 1, borderRadius: 12 }, overlay: { flex: 1, paddingHorizontal: 20, paddingVertical: 48, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.6)" }, dialog: { width: "100%", maxWidth: 460, maxHeight: "90%", borderWidth: 1, borderRadius: 24, padding: 16 }, heading: { flexDirection: "row", alignItems: "center", marginBottom: 12 }, close: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }, option: { minHeight: 54, borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 } });
