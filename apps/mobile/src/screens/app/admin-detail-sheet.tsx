import { useEffect, useState, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { AccessibilityInfo, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme/theme-provider";
import { useTranslation } from "@/i18n/use-translation";

export function AdminDetailSheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const theme = useTheme();
  const { locale } = useTranslation();
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => listener.remove();
  }, []);
  return <Modal visible={visible} animationType={reduceMotion ? "none" : "slide"} presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>{title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={locale === "tr" ? "Kapat ve listeye dön" : "Close and return to list"} onPress={onClose} style={[styles.close, { backgroundColor: theme.card }]}><Ionicons name="close" size={24} color={theme.text} /></Pressable>
      </View>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{children}</ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 1 }, title: { flex: 1, fontSize: 18, fontWeight: "700" }, close: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 14 }, content: { padding: 18, paddingBottom: 36, gap: 16 } });
