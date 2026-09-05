import { Ionicons } from "@expo/vector-icons";
import { useState, type ReactNode } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { useAuthStore } from "@/auth/auth-store";
import { useSettingsStore } from "@/auth/settings-store";
import { recordAppLockSecurityEvent } from "@/security/app-lock-audit";
import {
  APP_LOCK_AUTO_LOCK_OPTIONS,
  isValidAppLockPin,
  normalizeAppLockPin,
  type AppLockAutoLockSeconds,
} from "@/security/app-lock-policy";
import { useAppLockStore } from "@/security/app-lock-store";
import { useTheme } from "@/theme/theme-provider";

export function MobileAppLockSettings() {
  const theme = useTheme();
  const locale = useSettingsStore((state) => state.locale);
  const tr = locale === "tr";
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const config = useAppLockStore((state) => state.config);
  const biometric = useAppLockStore((state) => state.biometric);
  const enable = useAppLockStore((state) => state.enable);
  const disable = useAppLockStore((state) => state.disable);
  const changePin = useAppLockStore((state) => state.changePin);
  const updatePreferences = useAppLockStore((state) => state.updatePreferences);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [nextPin, setNextPin] = useState("");
  const [nextPinConfirmation, setNextPinConfirmation] = useState("");
  const [disablePin, setDisablePin] = useState("");
  const [changingPin, setChangingPin] = useState(false);
  const [busy, setBusy] = useState(false);

  function message(turkish: string, english: string) {
    return tr ? turkish : english;
  }

  async function enableLock() {
    if (!userId || !isValidAppLockPin(pin) || pin !== confirmPin) return;
    setBusy(true);
    try {
      await enable(userId, pin);
      await recordAppLockSecurityEvent("APP_LOCK_ENABLED");
      setPin("");
      setConfirmPin("");
      Alert.alert(message("Uygulama kilidi", "App lock"), message("Uygulama kilidi etkinleştirildi.", "App lock enabled."));
    } catch {
      Alert.alert(message("Uygulama kilidi", "App lock"), message("Kilit ayarı kaydedilemedi.", "The lock setting could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  async function updatePreference(patch: Parameters<typeof updatePreferences>[1]) {
    if (!userId || busy) return;
    setBusy(true);
    try {
      await updatePreferences(userId, patch);
      if (patch.biometricEnabled !== undefined) {
        await recordAppLockSecurityEvent("APP_LOCK_BIOMETRIC_UPDATED", { biometricEnabled: patch.biometricEnabled });
      }
      if (patch.autoLockSeconds !== undefined) {
        await recordAppLockSecurityEvent("APP_LOCK_AUTO_LOCK_UPDATED", { autoLockSeconds: patch.autoLockSeconds });
      }
      if (patch.appSwitcherPrivacyEnabled !== undefined) {
        await recordAppLockSecurityEvent("APP_LOCK_PRIVACY_UPDATED", { appSwitcherPrivacyEnabled: patch.appSwitcherPrivacyEnabled });
      }
    } catch {
      Alert.alert(message("Uygulama kilidi", "App lock"), message("Ayar güncellenemedi.", "The setting could not be updated."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleBiometric(enabled: boolean) {
    if (enabled && !biometric.available) {
      Alert.alert(
        message("Biyometri kullanılamıyor", "Biometrics unavailable"),
        message("Cihaz ayarlarından Face ID, Touch ID veya parmak izi ekleyin.", "Enroll Face ID, Touch ID, or a fingerprint in device settings."),
      );
      return;
    }
    await updatePreference({ biometricEnabled: enabled });
  }

  async function submitPinChange() {
    if (!userId || !isValidAppLockPin(currentPin) || !isValidAppLockPin(nextPin) || nextPin !== nextPinConfirmation) return;
    setBusy(true);
    try {
      const result = await changePin(userId, currentPin, nextPin);
      if (!result.success) {
        Alert.alert(message("PIN değiştirilemedi", "PIN not changed"), message("Geçerli PIN doğru değil veya geçici olarak kilitlendi.", "The current PIN is incorrect or temporarily blocked."));
        return;
      }
      setCurrentPin("");
      setNextPin("");
      setNextPinConfirmation("");
      setChangingPin(false);
      await recordAppLockSecurityEvent("APP_LOCK_PIN_CHANGED");
      Alert.alert(message("Uygulama kilidi", "App lock"), message("PIN değiştirildi.", "PIN changed."));
    } finally {
      setBusy(false);
    }
  }

  async function disableLock() {
    if (!userId || !isValidAppLockPin(disablePin)) return;
    setBusy(true);
    try {
      const result = await disable(userId, disablePin);
      if (!result.success) {
        Alert.alert(message("Kilit kapatılamadı", "Lock not disabled"), message("PIN doğru değil veya geçici olarak kilitlendi.", "The PIN is incorrect or temporarily blocked."));
        return;
      }
      setDisablePin("");
      await recordAppLockSecurityEvent("APP_LOCK_DISABLED");
      Alert.alert(message("Uygulama kilidi", "App lock"), message("Uygulama kilidi kapatıldı.", "App lock disabled."));
    } finally {
      setBusy(false);
    }
  }

  const enableReady = isValidAppLockPin(pin) && pin === confirmPin;
  const changeReady = isValidAppLockPin(currentPin) && isValidAppLockPin(nextPin) && nextPin === nextPinConfirmation;
  const biometricLabel = biometric.label === "Fingerprint"
    ? message("Parmak izi", "Fingerprint")
    : biometric.label === "Biometrics"
      ? message("Biyometri", "Biometrics")
      : biometric.label;

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.headingRow}>
        <View style={[styles.icon, { backgroundColor: config ? theme.successSoft : theme.cardMuted }]}>
          <Ionicons name={config ? "phone-portrait" : "lock-closed-outline"} size={22} color={config ? theme.success : theme.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: theme.text }]}>{message("Mobil uygulama kilidi", "Mobile app lock")}</Text>
          <Text style={[styles.body, { color: theme.muted }]}>
            {config
              ? message("6 haneli PIN ile korunuyor.", "Protected with a 6-digit PIN.")
              : message("Uygulamayı PIN ve cihaz biyometrisiyle koruyun.", "Protect the app with a PIN and device biometrics.")}
          </Text>
        </View>
      </View>

      {!config ? (
        <View style={styles.stack}>
          <PinInput label={message("6 haneli PIN", "6-digit PIN")} value={pin} onChangeText={setPin} />
          <PinInput label={message("PIN'i doğrulayın", "Confirm PIN")} value={confirmPin} onChangeText={setConfirmPin} />
          {confirmPin.length === 6 && pin !== confirmPin ? <Text style={[styles.error, { color: theme.danger }]}>{message("PIN'ler eşleşmiyor.", "PINs do not match.")}</Text> : null}
          <ActionButton disabled={!enableReady || busy} label={message("Uygulama kilidini aç", "Enable app lock")} onPress={() => void enableLock()} />
          <Text style={[styles.caption, { color: theme.muted }]}>{message("PIN sunucuya gönderilmez; yalnızca bu cihazın güvenli deposunda şifreli bir doğrulayıcı tutulur.", "The PIN is never sent to the server; only an encrypted verifier is kept in this device's secure storage.")}</Text>
        </View>
      ) : (
        <View style={styles.stack}>
          <SettingRow
            description={biometric.available ? biometricLabel : message("Cihazda kayıtlı biyometri bulunamadı", "No enrolled biometrics found")}
            title={message("Biyometri ile aç", "Unlock with biometrics")}
          >
            <Switch disabled={busy} value={config.biometricEnabled && biometric.available} onValueChange={(value) => void toggleBiometric(value)} />
          </SettingRow>
          <View style={styles.settingBlock}>
            <Text style={[styles.settingTitle, { color: theme.text }]}>{message("Otomatik kilit", "Auto-lock")}</Text>
            <View style={styles.chips}>
              {APP_LOCK_AUTO_LOCK_OPTIONS.map((seconds) => (
                <IntervalChip
                  active={config.autoLockSeconds === seconds}
                  key={seconds}
                  label={autoLockLabel(seconds, tr)}
                  onPress={() => void updatePreference({ autoLockSeconds: seconds })}
                />
              ))}
            </View>
          </View>
          <SettingRow
            description={message("Arka planda uygulama önizlemesini bulanıklaştırır.", "Blurs the app preview while it is in the background.")}
            title={message("Uygulama değiştirici gizliliği", "App switcher privacy")}
          >
            <Switch disabled={busy} value={config.appSwitcherPrivacyEnabled} onValueChange={(value) => void updatePreference({ appSwitcherPrivacyEnabled: value })} />
          </SettingRow>

          <Pressable accessibilityRole="button" onPress={() => setChangingPin((current) => !current)} style={[styles.secondaryButton, { borderColor: theme.border }]}>
            <Ionicons name="key-outline" size={18} color={theme.primary} />
            <Text style={[styles.secondaryText, { color: theme.text }]}>{message("PIN'i değiştir", "Change PIN")}</Text>
          </Pressable>
          {changingPin ? (
            <View style={styles.stack}>
              <PinInput label={message("Geçerli PIN", "Current PIN")} value={currentPin} onChangeText={setCurrentPin} />
              <PinInput label={message("Yeni PIN", "New PIN")} value={nextPin} onChangeText={setNextPin} />
              <PinInput label={message("Yeni PIN'i doğrulayın", "Confirm new PIN")} value={nextPinConfirmation} onChangeText={setNextPinConfirmation} />
              <ActionButton disabled={!changeReady || busy} label={message("PIN'i kaydet", "Save PIN")} onPress={() => void submitPinChange()} />
            </View>
          ) : null}

          <View style={[styles.dangerZone, { borderTopColor: theme.border }]}>
            <Text style={[styles.settingTitle, { color: theme.text }]}>{message("Uygulama kilidini kapat", "Disable app lock")}</Text>
            <PinInput label={message("Geçerli PIN", "Current PIN")} value={disablePin} onChangeText={setDisablePin} />
            <Pressable
              accessibilityRole="button"
              disabled={!isValidAppLockPin(disablePin) || busy}
              onPress={() => void disableLock()}
              style={[styles.dangerButton, { borderColor: theme.danger, opacity: !isValidAppLockPin(disablePin) || busy ? 0.45 : 1 }]}
            >
              <Text style={[styles.dangerText, { color: theme.danger }]}>{message("Kilidi kapat", "Disable lock")}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function PinInput({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.inputGroup}>
      <Text style={[styles.inputLabel, { color: theme.muted }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType="number-pad"
        maxLength={6}
        onChangeText={(next) => onChangeText(normalizeAppLockPin(next))}
        placeholder="••••••"
        placeholderTextColor={theme.muted}
        secureTextEntry
        style={[styles.input, { backgroundColor: theme.cardMuted, borderColor: theme.border, color: theme.text }]}
        value={value}
      />
    </View>
  );
}

function ActionButton({ disabled, label, onPress }: { disabled: boolean; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.actionButton, { backgroundColor: theme.primary, opacity: disabled ? 0.45 : 1 }]}>
      <Text style={[styles.actionText, { color: theme.primaryText }]}>{label}</Text>
    </Pressable>
  );
}

function SettingRow({ children, description, title }: { children: ReactNode; description: string; title: string }) {
  const theme = useTheme();
  return (
    <View style={styles.settingRow}>
      <View style={styles.flex}>
        <Text style={[styles.settingTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.caption, { color: theme.muted }]}>{description}</Text>
      </View>
      {children}
    </View>
  );
}

function IntervalChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.chip, { backgroundColor: active ? theme.primary : theme.cardMuted, borderColor: active ? theme.primary : theme.border }]}>
      <Text style={[styles.chipText, { color: active ? theme.primaryText : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

function autoLockLabel(seconds: AppLockAutoLockSeconds, tr: boolean) {
  if (seconds === 0) return tr ? "Hemen" : "Immediately";
  if (seconds === 60) return tr ? "1 dk" : "1 min";
  if (seconds === 300) return tr ? "5 dk" : "5 min";
  return tr ? "15 dk" : "15 min";
}

const styles = StyleSheet.create({
  card: { borderRadius: 8, borderWidth: 1, gap: 16, padding: 16 },
  headingRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  icon: { alignItems: "center", borderRadius: 8, height: 44, justifyContent: "center", width: 44 },
  flex: { flex: 1 },
  title: { fontSize: 17, fontWeight: "900" },
  body: { fontSize: 14, lineHeight: 20, marginTop: 3 },
  stack: { gap: 12 },
  caption: { fontSize: 12, lineHeight: 18 },
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: 12, fontWeight: "800" },
  input: { borderRadius: 8, borderWidth: 1, fontSize: 20, fontWeight: "800", letterSpacing: 6, minHeight: 54, paddingHorizontal: 14 },
  error: { fontSize: 13, fontWeight: "700" },
  actionButton: { alignItems: "center", borderRadius: 8, justifyContent: "center", minHeight: 52 },
  actionText: { fontSize: 15, fontWeight: "900" },
  settingRow: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  settingBlock: { gap: 9 },
  settingTitle: { fontSize: 14, fontWeight: "900" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 8, borderWidth: 1, minHeight: 42, justifyContent: "center", paddingHorizontal: 12 },
  chipText: { fontSize: 13, fontWeight: "800" },
  secondaryButton: { alignItems: "center", borderRadius: 8, borderWidth: 1, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 50 },
  secondaryText: { fontSize: 14, fontWeight: "800" },
  dangerZone: { borderTopWidth: StyleSheet.hairlineWidth, gap: 10, marginTop: 4, paddingTop: 14 },
  dangerButton: { alignItems: "center", borderRadius: 8, borderWidth: 1, justifyContent: "center", minHeight: 50 },
  dangerText: { fontSize: 14, fontWeight: "900" },
});
