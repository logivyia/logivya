import { Ionicons } from "@expo/vector-icons";
import * as ScreenCapture from "expo-screen-capture";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, AppState, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { clearMobileSessionState } from "@/auth/session-cleanup";
import { useAuthStore } from "@/auth/auth-store";
import { useSettingsStore } from "@/auth/settings-store";
import { recordAppLockSecurityEvent } from "@/security/app-lock-audit";
import { normalizeAppLockPin, shouldLockAfterBackground } from "@/security/app-lock-policy";
import { useAppLockStore } from "@/security/app-lock-store";
import { useTheme } from "@/theme/theme-provider";

export function AppLockGate({ children }: { children: ReactNode }) {
  const authStatus = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const storeUserId = useAppLockStore((state) => state.userId);
  const initialize = useAppLockStore((state) => state.initialize);
  const clearRuntime = useAppLockStore((state) => state.clearRuntime);
  const lock = useAppLockStore((state) => state.lock);
  const config = useAppLockStore((state) => state.config);
  const locked = useAppLockStore((state) => state.locked);
  const loading = useAppLockStore((state) => state.loading);
  const initializationFailed = useAppLockStore((state) => state.initializationFailed);
  const backgroundedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (authStatus === "authenticated" && userId) {
      void initialize(userId);
      return;
    }
    clearRuntime();
  }, [authStatus, clearRuntime, initialize, userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        if (config && shouldLockAfterBackground(backgroundedAtRef.current, Date.now(), config.autoLockSeconds)) lock();
        backgroundedAtRef.current = null;
        return;
      }
      if (nextState === "inactive" || nextState === "background") {
        backgroundedAtRef.current ??= Date.now();
      }
    });
    return () => subscription.remove();
  }, [config, lock]);

  useEffect(() => {
    if (!config?.appSwitcherPrivacyEnabled) return;
    void ScreenCapture.enableAppSwitcherProtectionAsync(0.8).catch(() => undefined);
    return () => {
      void ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => undefined);
    };
  }, [config?.appSwitcherPrivacyEnabled]);

  useEffect(() => {
    if (!locked) return;
    void ScreenCapture.preventScreenCaptureAsync("logivya-app-lock").catch(() => undefined);
    return () => {
      void ScreenCapture.allowScreenCaptureAsync("logivya-app-lock").catch(() => undefined);
    };
  }, [locked]);

  const initializingCurrentUser = authStatus === "authenticated" && Boolean(userId) && storeUserId !== userId;
  const shouldCoverApp = authStatus === "authenticated" && (initializingCurrentUser || loading || locked || initializationFailed);

  return (
    <View style={styles.root}>
      <View style={styles.root}>{children}</View>
      {shouldCoverApp ? <AppLockOverlay initializationFailed={initializationFailed} loading={loading || initializingCurrentUser} /> : null}
    </View>
  );
}

function AppLockOverlay({ initializationFailed, loading }: { initializationFailed: boolean; loading: boolean }) {
  const theme = useTheme();
  const locale = useSettingsStore((state) => state.locale);
  const tr = locale === "tr";
  const config = useAppLockStore((state) => state.config);
  const biometric = useAppLockStore((state) => state.biometric);
  const unlockWithPin = useAppLockStore((state) => state.unlockWithPin);
  const unlockWithBiometric = useAppLockStore((state) => state.unlockWithBiometric);
  const resetForAccountRecovery = useAppLockStore((state) => state.resetForAccountRecovery);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const promptedRef = useRef(false);

  useEffect(() => {
    if (!blockedUntil || blockedUntil <= Date.now()) return;
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [blockedUntil]);

  useEffect(() => {
    if (loading || !config?.biometricEnabled || !biometric.available || promptedRef.current) return;
    promptedRef.current = true;
    setBusy(true);
    void unlockWithBiometric().finally(() => setBusy(false));
  }, [biometric.available, config?.biometricEnabled, loading, unlockWithBiometric]);

  async function submitPin() {
    if (pin.length !== 6 || busy) return;
    setBusy(true);
    setError("");
    const result = await unlockWithPin(pin).catch(() => ({ success: false as const, reason: "INVALID" as const, blockedUntil: null }));
    setBusy(false);
    if (!result.success) {
      setPin("");
      setBlockedUntil(result.blockedUntil);
      setNow(Date.now());
      setError(result.reason === "BLOCKED"
        ? tr ? "Çok fazla hatalı deneme. Kısa süre sonra yeniden deneyin." : "Too many attempts. Try again shortly."
        : tr ? "PIN doğru değil." : "The PIN is incorrect.");
    }
  }

  async function useBiometric() {
    if (busy) return;
    setBusy(true);
    setError("");
    const success = await unlockWithBiometric().catch(() => false);
    setBusy(false);
    if (!success) setError(tr ? "Biyometrik doğrulama tamamlanamadı. PIN kullanın." : "Biometric verification failed. Use your PIN.");
  }

  function forgotPin() {
    Alert.alert(
      tr ? "PIN'i unuttunuz mu?" : "Forgot your PIN?",
      tr ? "Uygulama kilidi sıfırlanacak ve hesabınızla yeniden giriş yapmanız istenecek." : "The app lock will be reset and you will need to sign in again.",
      [
        { text: tr ? "İptal" : "Cancel", style: "cancel" },
        {
          text: tr ? "Yeniden giriş yap" : "Sign in again",
          style: "destructive",
          onPress: () => {
            void (async () => {
              await recordAppLockSecurityEvent("APP_LOCK_RECOVERY_STARTED");
              try {
                await resetForAccountRecovery();
              } finally {
                await clearMobileSessionState();
              }
            })();
          },
        },
      ],
    );
  }

  function reauthenticateAfterStorageError() {
    void (async () => {
      await recordAppLockSecurityEvent("APP_LOCK_RECOVERY_STARTED");
      await clearMobileSessionState();
    })();
  }

  const remainingSeconds = blockedUntil ? Math.max(0, Math.ceil((blockedUntil - now) / 1_000)) : 0;
  const blocked = remainingSeconds > 0;
  const biometricLabel = biometric.label === "Fingerprint"
    ? tr ? "Parmak izi" : "Fingerprint"
    : biometric.label === "Biometrics"
      ? tr ? "Biyometri" : "Biometrics"
      : biometric.label;

  return (
    <View accessibilityViewIsModal style={[styles.overlay, { backgroundColor: theme.background }]}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.subtitle, { color: theme.muted }]}>{tr ? "Güvenli kilit yükleniyor..." : "Loading secure lock..."}</Text>
        </View>
      ) : initializationFailed ? (
        <View style={styles.panel}>
          <View style={[styles.icon, { backgroundColor: theme.cardMuted }]}>
            <Ionicons name="shield-checkmark" size={34} color={theme.primary} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{tr ? "Güvenli kilit doğrulanamadı" : "Secure lock could not be verified"}</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            {tr
              ? "Cihazdaki güvenli kilit alanı okunamadı. Hesabınızı korumak için yeniden giriş yapın."
              : "The secure lock storage could not be read. Sign in again to protect your account."}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={reauthenticateAfterStorageError}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: theme.primary, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={[styles.primaryText, { color: theme.primaryText }]}>{tr ? "Yeniden giriş yap" : "Sign in again"}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.panel}>
          <View style={[styles.icon, { backgroundColor: theme.cardMuted }]}>
            <Ionicons name="lock-closed" size={34} color={theme.primary} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{tr ? "Logivya kilitli" : "Logivya is locked"}</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>{tr ? "Devam etmek için 6 haneli PIN'inizi girin." : "Enter your 6-digit PIN to continue."}</Text>
          <TextInput
            accessibilityLabel={tr ? "Uygulama kilidi PIN'i" : "App lock PIN"}
            autoFocus={!config?.biometricEnabled}
            editable={!busy && !blocked}
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={(value) => setPin(normalizeAppLockPin(value))}
            onSubmitEditing={() => void submitPin()}
            placeholder="••••••"
            placeholderTextColor={theme.muted}
            secureTextEntry
            style={[styles.pinInput, { backgroundColor: theme.card, borderColor: error ? theme.danger : theme.border, color: theme.text }]}
            value={pin}
          />
          {error ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: theme.danger }]}>{error}{blocked ? ` ${remainingSeconds}s` : ""}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={busy || blocked || pin.length !== 6}
            onPress={() => void submitPin()}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: theme.primary, opacity: busy || blocked || pin.length !== 6 ? 0.45 : pressed ? 0.8 : 1 }]}
          >
            {busy ? <ActivityIndicator color={theme.primaryText} /> : <Text style={[styles.primaryText, { color: theme.primaryText }]}>{tr ? "Kilidi aç" : "Unlock"}</Text>}
          </Pressable>
          {config?.biometricEnabled && biometric.available ? (
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void useBiometric()} style={styles.textButton}>
              <Ionicons name="finger-print" size={21} color={theme.primary} />
              <Text style={[styles.textButtonLabel, { color: theme.primary }]}>{biometricLabel} {tr ? "ile aç" : "unlock"}</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={forgotPin} style={styles.textButton}>
            <Text style={[styles.textButtonLabel, { color: theme.muted }]}>{tr ? "PIN'i unuttum" : "Forgot PIN"}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 24, zIndex: 10_000 },
  loading: { alignItems: "center", gap: 14 },
  panel: { alignItems: "stretch", gap: 14, maxWidth: 420, width: "100%" },
  icon: { alignItems: "center", alignSelf: "center", borderRadius: 8, height: 72, justifyContent: "center", width: 72 },
  title: { fontSize: 27, fontWeight: "900", textAlign: "center" },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: "center" },
  pinInput: { borderRadius: 8, borderWidth: 1, fontSize: 28, fontWeight: "800", letterSpacing: 8, minHeight: 62, paddingHorizontal: 18, textAlign: "center" },
  error: { fontSize: 13, fontWeight: "700", textAlign: "center" },
  primaryButton: { alignItems: "center", borderRadius: 8, justifyContent: "center", minHeight: 56 },
  primaryText: { fontSize: 16, fontWeight: "900" },
  textButton: { alignItems: "center", alignSelf: "center", flexDirection: "row", gap: 8, minHeight: 44, paddingHorizontal: 12 },
  textButtonLabel: { fontSize: 14, fontWeight: "800" },
});
