import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "@/auth/auth-store";
import { useSettingsStore } from "@/auth/settings-store";
import { config } from "@/constants/config";
import { iosUpdateCopy } from "@/i18n/ios-update-copy";
import { useAppLockStore } from "@/security/app-lock-store";
import { createIosUpdateChecker, lookupCountry, openIosUpdateStore } from "@/services/ios-update-policy";
import { useTheme } from "@/theme/theme-provider";

const checkForUpdate = createIosUpdateChecker();

export function IosUpdatePrompt() {
  const theme = useTheme();
  const status = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.user?.id);
  const locale = useSettingsStore((state) => state.locale);
  const hydrated = useSettingsStore((state) => state.hydrated);
  const onboardingCompleted = useSettingsStore((state) => state.onboardingCompleted);
  const lockReady = useAppLockStore((state) => state.userId === userId && !state.loading && !state.locked && !state.initializationFailed);
  const [version, setVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [active, setActive] = useState(AppState.currentState === "active");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const openingRef = useRef(false);
  const copy = iosUpdateCopy[locale];

  useEffect(() => {
    setVersion(null);
    setDismissed(null);
    setFailed(false);
    if (Platform.OS !== "ios" || status !== "authenticated" || !userId) return;
    setActive(AppState.currentState === "active");
    let cancelled = false;
    let country = "US";
    try { country = lookupCountry(Intl.DateTimeFormat().resolvedOptions().locale); } catch { /* Use Apple's default storefront. */ }
    const refresh = async () => {
      const next = await checkForUpdate(config.appVersion, String(Platform.Version), country);
      if (!cancelled) setVersion(next);
    };
    // Let login and the first screen render without awaiting a store request.
    const timer = setTimeout(() => { if (AppState.currentState === "active") void refresh(); }, 2_000);
    const subscription = AppState.addEventListener("change", (state) => {
      setActive(state === "active");
      if (state === "active") void refresh();
    });
    return () => { cancelled = true; clearTimeout(timer); subscription.remove(); };
  }, [status, userId]);

  async function openStore() {
    if (openingRef.current) return;
    openingRef.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const opened = await openIosUpdateStore((url) => Linking.openURL(url));
      if (opened) setDismissed(version);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      openingRef.current = false;
      setBusy(false);
    }
  }

  const visible = Platform.OS === "ios" && status === "authenticated" && hydrated && onboardingCompleted && lockReady && active && Boolean(version) && dismissed !== version;
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setDismissed(version)}>
      <SafeAreaView style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, direction: locale === "ar" ? "rtl" : "ltr" }]} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={[styles.brand, { color: theme.primary }]}>LOGIVYA · {version}</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{copy.title}</Text>
            <Text style={[styles.body, { color: theme.muted }]}>{copy.body}</Text>
            {failed ? <Text accessibilityRole="alert" style={[styles.body, { color: theme.danger }]}>{copy.failed}</Text> : null}
            <Pressable testID="ios-update-now" accessibilityRole="button" accessibilityLabel={copy.update} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void openStore()} style={[styles.button, { backgroundColor: theme.primary, opacity: busy ? 0.6 : 1 }]}>
              <Text style={[styles.buttonText, { color: theme.primaryText }]}>{copy.update}</Text>
            </Pressable>
            <Pressable testID="ios-update-later" accessibilityRole="button" onPress={() => setDismissed(version)} style={styles.button}>
              <Text style={[styles.buttonText, { color: theme.text }]}>{copy.later}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, padding: 24, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.65)" },
  card: { width: "100%", maxWidth: 440, maxHeight: "90%", borderWidth: 1, borderRadius: 24, overflow: "hidden" },
  content: { padding: 24, gap: 16 },
  brand: { fontSize: 13, fontWeight: "800" },
  title: { fontSize: 24, fontWeight: "800" },
  body: { fontSize: 16, lineHeight: 24 },
  button: { minHeight: 48, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  buttonText: { fontSize: 16, fontWeight: "700", textAlign: "center" },
});
