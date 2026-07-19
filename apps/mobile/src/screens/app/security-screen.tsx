import { useCallback, useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { usePreventScreenCapture } from "expo-screen-capture";
import { Ionicons } from "@expo/vector-icons";

import { clearMobileSessionState } from "@/auth/session-cleanup";
import { cancelMfaEnrollment, confirmMfaEnrollment, disableMfa, getMfaStatus, getSecuritySessions, logoutEverywhere, regenerateMfaRecoveryCodes, revokeMfaTrustedDevice, revokeSecuritySession, startMfaEnrollment, type MfaEnrollment, type MfaStatus, type SecuritySession } from "@/api/mfa-api";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { useTranslation } from "@/i18n/use-translation";
import { clearMfaTrustedDeviceToken } from "@/storage/secure-storage";
import { useTheme } from "@/theme/theme-provider";

export function SecurityScreen() {
  usePreventScreenCapture("logivya-security-screen");
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<SecuritySession[]>([]);

  const load = useCallback(async () => {
    try {
      const [nextStatus, nextSessions] = await Promise.all([getMfaStatus(), getSecuritySessions()]);
      setStatus(nextStatus); setSessions(nextSessions.sessions);
    }
    catch (error) { Alert.alert(t("security"), error instanceof Error ? error.message : t("operationFailedError")); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  async function begin() {
    setBusy(true);
    try {
      const result = await startMfaEnrollment(password, status?.enabled ? code : undefined);
      setEnrollment(result); setRecoveryCodes([]); setCode("");
    } catch (error) { Alert.alert(t("security"), error instanceof Error ? error.message : t("operationFailedError")); }
    finally { setBusy(false); }
  }

  async function confirm() {
    setBusy(true);
    try { const result = await confirmMfaEnrollment(enrollment!.setupToken, code); setRecoveryCodes(result.recoveryCodes); setEnrollment(null); setCode(""); setPassword(""); await load(); Alert.alert(t("security"), t("mfaEnabledSuccess")); }
    catch (error) { Alert.alert(t("security"), error instanceof Error ? error.message : t("operationFailedError")); }
    finally { setBusy(false); }
  }

  async function cancelEnrollment() {
    setBusy(true);
    try { await cancelMfaEnrollment(enrollment?.setupToken); setEnrollment(null); setCode(""); await load(); }
    catch (error) { Alert.alert(t("security"), error instanceof Error ? error.message : t("operationFailedError")); }
    finally { setBusy(false); }
  }

  async function regenerate() {
    setBusy(true);
    try { const result = await regenerateMfaRecoveryCodes(password, code); setRecoveryCodes(result.recoveryCodes); setCode(""); setPassword(""); await load(); }
    catch (error) { Alert.alert(t("security"), error instanceof Error ? error.message : t("operationFailedError")); }
    finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true);
    try {
      await disableMfa(password, code);
      await clearMfaTrustedDeviceToken();
      await clearMobileSessionState();
    } catch (error) { Alert.alert(t("security"), error instanceof Error ? error.message : t("operationFailedError")); setBusy(false); }
  }

  async function revokeDevice(id: string) {
    setBusy(true);
    try { await revokeMfaTrustedDevice(id); await load(); }
    catch (error) { Alert.alert(t("security"), error instanceof Error ? error.message : t("operationFailedError")); }
    finally { setBusy(false); }
  }

  async function revokeSession(session: SecuritySession) {
    setBusy(true);
    try {
      const result = await revokeSecuritySession(session);
      if (result.currentRevoked) { await clearMobileSessionState(); return; }
      await load();
    } catch (error) { Alert.alert(t("security"), error instanceof Error ? error.message : t("operationFailedError")); }
    finally { setBusy(false); }
  }

  async function signOutEverywhere() {
    setBusy(true);
    try { await logoutEverywhere(); await clearMobileSessionState(); }
    catch (error) { Alert.alert(t("security"), error instanceof Error ? error.message : t("operationFailedError")); setBusy(false); }
  }

  async function copyRecoveryCodes() {
    const value = recoveryCodes.join("\n");
    await Clipboard.setStringAsync(value);
    setTimeout(() => {
      void Clipboard.getStringAsync().then((current) => current === value ? Clipboard.setStringAsync("") : undefined).catch(() => undefined);
    }, 60_000);
  }

  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <View><Text style={[styles.title, { color: theme.text }]}>{t("security")}</Text><Text style={[styles.subtitle, { color: theme.muted }]}>{t("mfaSecurityDescription")}</Text></View>
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.headingRow}><View style={[styles.icon, { backgroundColor: status?.enabled ? theme.successSoft : theme.cardMuted }]}><Ionicons name={status?.enabled ? "shield-checkmark" : "shield-outline"} size={22} color={status?.enabled ? theme.success : theme.primary} /></View><View style={styles.flex}><Text style={[styles.cardTitle, { color: theme.text }]}>{t("mfaTitle")}</Text><Text style={[styles.body, { color: theme.muted }]}>{t(status?.enabled ? "mfaEnabled" : "mfaDisabled")}</Text></View></View>
      {!status?.enabled && !enrollment && !status?.setupInProgress ? <View style={styles.stack}><TextField label={t("password")} secureTextEntry value={password} onChangeText={setPassword} /><PrimaryButton title={t("mfaEnable")} icon="key-outline" loading={busy} disabled={!password} onPress={begin} /></View> : null}
      {status?.setupInProgress && !enrollment ? <View style={styles.stack}><Text style={[styles.body, { color: theme.muted }]}>{t("mfaSetupSubtitle")}</Text><Pressable disabled={busy} onPress={() => void cancelEnrollment()} style={[styles.secondaryButton, { borderColor: theme.border }]}><Text style={[styles.secondaryText, { color: theme.text }]}>{t("cancel")}</Text></Pressable></View> : null}
      {enrollment ? <View style={styles.stack}><View style={styles.qrPanel}><Image source={{ uri: enrollment.qrCodeDataUrl }} style={styles.qr} /></View><Text style={[styles.label, { color: theme.muted }]}>{t("mfaManualKey")}</Text><Text selectable style={[styles.mono, { color: theme.text, backgroundColor: theme.cardMuted }]}>{enrollment.secret}</Text><Pressable onPress={() => void Clipboard.setStringAsync(enrollment.secret)} style={styles.textButton}><Ionicons name="copy-outline" size={18} color={theme.primary} /><Text style={{ color: theme.primary, fontWeight: "800" }}>{t("mfaCopyCodes")}</Text></Pressable><TextField label={t("mfaCode")} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" value={code} onChangeText={(value) => setCode(value.replace(/\D/gu, "").slice(0, 6))} /><PrimaryButton title={t("mfaConfirmEnable")} loading={busy} disabled={code.length !== 6} onPress={confirm} /><Pressable disabled={busy} onPress={() => void cancelEnrollment()} style={[styles.secondaryButton, { borderColor: theme.border }]}><Text style={[styles.secondaryText, { color: theme.text }]}>{t("cancel")}</Text></Pressable></View> : null}
      {status?.enabled && !enrollment ? <View style={styles.stack}><TextField label={t("password")} secureTextEntry value={password} onChangeText={setPassword} /><TextField label={t("mfaCode")} keyboardType="number-pad" maxLength={6} value={code} onChangeText={(value) => setCode(value.replace(/\D/gu, "").slice(0, 6))} /><PrimaryButton title={t("mfaConfirmEnable")} icon="refresh" loading={busy} disabled={!password || code.length !== 6} onPress={begin} /><Pressable disabled={busy || !password || code.length !== 6} onPress={disable} style={[styles.dangerButton, { borderColor: theme.danger }]}><Text style={[styles.dangerText, { color: theme.danger }]}>{t("mfaDisable")}</Text></Pressable></View> : null}
    </View>
    {recoveryCodes.length || status?.enabled ? <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}><Text style={[styles.cardTitle, { color: theme.text }]}>{t("mfaRecoveryCodes")}</Text><Text style={[styles.body, { color: theme.muted }]}>{t("mfaRecoveryRemaining", { count: status?.recoveryCodesRemaining ?? recoveryCodes.length })}</Text>{recoveryCodes.length ? <><Text selectable style={[styles.recovery, { color: theme.text, backgroundColor: theme.cardMuted }]}>{recoveryCodes.join("\n")}</Text><Pressable onPress={() => void copyRecoveryCodes()} style={styles.textButton}><Ionicons name="copy-outline" size={18} color={theme.primary} /><Text style={{ color: theme.primary, fontWeight: "800" }}>{t("mfaCopyCodes")}</Text></Pressable></> : null}{status?.enabled ? <><TextField label={t("password")} secureTextEntry value={password} onChangeText={setPassword} /><TextField label={t("mfaCode")} keyboardType="number-pad" maxLength={6} value={code} onChangeText={(value) => setCode(value.replace(/\D/gu, "").slice(0, 6))} /><PrimaryButton title={t("mfaRegenerate")} icon="refresh" loading={busy} disabled={!password || code.length !== 6} onPress={regenerate} /></> : null}</View> : null}
    <View style={styles.section}><View style={styles.sectionHeader}><Text style={[styles.cardTitle, { color: theme.text }]}>{t("mfaActiveSessions")}</Text><Pressable disabled={busy || !sessions.length} onPress={() => Alert.alert(t("mfaLogoutEverywhere"), t("mfaLogoutEverywhereConfirm"), [{ text: t("cancel"), style: "cancel" }, { text: t("logout"), style: "destructive", onPress: () => void signOutEverywhere() }])} style={[styles.logoutAllButton, { borderColor: theme.danger }]}><Ionicons name="log-out-outline" size={17} color={theme.danger} /><Text style={[styles.logoutAllText, { color: theme.danger }]}>{t("mfaLogoutEverywhere")}</Text></Pressable></View>{sessions.length ? sessions.map((session) => <View key={`${session.kind}:${session.id}`} style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}><View style={styles.flex}><Text style={[styles.rowTitle, { color: theme.text }]}>{session.deviceName}{session.current ? <Text style={{ color: theme.primary }}> · {t("mfaCurrentSession")}</Text> : null}</Text><Text style={[styles.caption, { color: theme.muted }]}>{session.kind}{session.ipAddress ? ` · ${session.ipAddress}` : ""} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.lastActiveAt))}</Text></View><Pressable disabled={busy} onPress={() => void revokeSession(session)} style={styles.iconButton}><Ionicons name="log-out-outline" size={20} color={theme.danger} /></Pressable></View>) : <Text style={[styles.empty, { color: theme.muted, borderColor: theme.border }]}>{t("mfaNoActiveSessions")}</Text>}</View>
    <View style={styles.section}><Text style={[styles.cardTitle, { color: theme.text }]}>{t("mfaTrustedDevices")}</Text>{status?.trustedDevices.length ? status.trustedDevices.map((device) => <View key={device.id} style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}><View style={styles.flex}><Text style={[styles.rowTitle, { color: theme.text }]}>{device.deviceName || t("mfaUnknownDevice")}</Text><Text style={[styles.caption, { color: theme.muted }]}>{device.ipAddress} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(device.lastUsedAt || device.trustedAt))}</Text></View><Pressable disabled={busy} onPress={() => void revokeDevice(device.id)} style={styles.iconButton}><Ionicons name="trash-outline" size={20} color={theme.danger} /></Pressable></View>) : <Text style={[styles.empty, { color: theme.muted, borderColor: theme.border }]}>{t("mfaNoTrustedDevices")}</Text>}</View>
    <View style={styles.section}><Text style={[styles.cardTitle, { color: theme.text }]}>{t("mfaActivity")}</Text>{status?.recentEvents.length ? status.recentEvents.map((event) => <View key={event.id} style={[styles.event, { borderBottomColor: theme.border }]}><Text style={[styles.rowTitle, { color: theme.text }]}>{event.message}</Text><Text style={[styles.caption, { color: theme.muted }]}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.createdAt))}</Text></View>) : <Text style={[styles.body, { color: theme.muted }]}>{t("mfaNoActivity")}</Text>}</View>
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18 }, content: { gap: 16, paddingBottom: 32 }, title: { fontSize: 28, fontWeight: "900" }, subtitle: { fontSize: 14, lineHeight: 20, marginTop: 4 }, card: { borderRadius: 18, borderWidth: 1, gap: 16, padding: 16 }, headingRow: { alignItems: "center", flexDirection: "row", gap: 12 }, icon: { alignItems: "center", borderRadius: 22, height: 44, justifyContent: "center", width: 44 }, flex: { flex: 1 }, cardTitle: { fontSize: 17, fontWeight: "900" }, body: { fontSize: 14, lineHeight: 20 }, stack: { gap: 12 }, qrPanel: { alignSelf: "center", backgroundColor: "#FFFFFF", borderRadius: 8, padding: 8 }, qr: { height: 220, width: 220 }, label: { fontSize: 12, fontWeight: "800" }, mono: { borderRadius: 10, fontFamily: "monospace", fontSize: 14, padding: 12 }, recovery: { borderRadius: 10, fontFamily: "monospace", fontSize: 13, lineHeight: 20, padding: 12 }, dangerButton: { alignItems: "center", borderRadius: 14, borderWidth: 1, justifyContent: "center", minHeight: 52 }, dangerText: { fontSize: 15, fontWeight: "900" }, secondaryButton: { alignItems: "center", borderRadius: 14, borderWidth: 1, justifyContent: "center", minHeight: 52 }, secondaryText: { fontSize: 15, fontWeight: "800" }, textButton: { alignItems: "center", flexDirection: "row", gap: 8 }, section: { gap: 10 }, sectionHeader: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }, logoutAllButton: { alignItems: "center", borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 6, minHeight: 38, paddingHorizontal: 10 }, logoutAllText: { fontSize: 12, fontWeight: "800" }, row: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 10, padding: 14 }, rowTitle: { fontSize: 14, fontWeight: "800" }, caption: { fontSize: 12, marginTop: 3 }, iconButton: { alignItems: "center", height: 42, justifyContent: "center", width: 42 }, empty: { borderStyle: "dashed", borderRadius: 14, borderWidth: 1, fontSize: 14, padding: 14 }, event: { borderBottomWidth: StyleSheet.hairlineWidth, gap: 3, paddingVertical: 10 },
});
