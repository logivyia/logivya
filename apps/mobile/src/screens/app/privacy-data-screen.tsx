import * as SecureStore from "expo-secure-store";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { downloadPrivacyExport, getPrivacyOverview, requestPrivacyExport, submitPrivacyRequest, updatePrivacyPurpose, type MobilePrivacyOverview } from "@/api/privacy-api";
import { useSettingsStore } from "@/auth/settings-store";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { PageHeader, SurfaceCard } from "@/components/ui";
import { useTranslation } from "@/i18n/use-translation";
import { configureAnalyticsCollection } from "@/services/analytics";
import { configureCrashReporting } from "@/services/crash-reporting";
import { configurePerformanceMonitoring } from "@/services/performance-monitoring";
import { useTheme } from "@/theme/theme-provider";

const tokenKey = (publicId: string) => `logivya.privacy.export.${publicId}`;

export function PrivacyDataScreen() {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const analyticsEnabled = useSettingsStore((state) => state.analyticsEnabled);
  const diagnosticsEnabled = useSettingsStore((state) => state.diagnosticsEnabled);
  const setAnalyticsEnabled = useSettingsStore((state) => state.setAnalyticsEnabled);
  const setDiagnosticsEnabled = useSettingsStore((state) => state.setDiagnosticsEnabled);
  const [overview, setOverview] = useState<MobilePrivacyOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [requestPassword, setRequestPassword] = useState("");
  const [requestDescription, setRequestDescription] = useState("");
  const [requestType, setRequestType] = useState("ACCESS");

  const load = useCallback(async () => {
    setOverview(await getPrivacyOverview());
  }, []);

  useEffect(() => { void load().catch((error) => Alert.alert(t("privacyData"), error instanceof Error ? error.message : t("operationFailed"))); }, [load, t]);

  const purposeStatuses = useMemo(() => new Map(overview?.purposes.map((purpose) => [purpose.code, purpose.currentStatus]) ?? []), [overview]);

  async function togglePurpose(purpose: string, enabled: boolean) {
    setLoading(true);
    try {
      await updatePrivacyPurpose(purpose, enabled, locale);
      if (purpose === "PRODUCT_ANALYTICS") {
        setAnalyticsEnabled(enabled);
        await configureAnalyticsCollection(enabled);
      }
      if (purpose === "CRASH_DIAGNOSTICS") {
        setDiagnosticsEnabled(enabled);
        await configureCrashReporting(enabled);
        await configurePerformanceMonitoring(enabled);
      }
      await load();
    } catch (error) {
      Alert.alert(t("privacyPreferenceFailed"), error instanceof Error ? error.message : t("operationFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function queueExport() {
    setLoading(true);
    try {
      const result = await requestPrivacyExport(exportPassword);
      await SecureStore.setItemAsync(tokenKey(result.job.publicId), result.oneTimeDownloadToken);
      setExportPassword("");
      await load();
      Alert.alert(t("requestReceived"), t("privacyExportQueued"));
    } catch (error) {
      Alert.alert(t("privacyExportFailed"), error instanceof Error ? error.message : t("operationFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function download(publicId: string) {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync(tokenKey(publicId));
      if (!token) throw new Error(t("privacyExportTokenMissing"));
      const bytes = await downloadPrivacyExport(publicId, token);
      const file = new File(Paths.cache, `logivya-privacy-export-${publicId}.json`);
      file.create({ overwrite: true });
      file.write(new Uint8Array(bytes));
      await SecureStore.deleteItemAsync(tokenKey(publicId));
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: t("privacyExportTitle") });
      else Alert.alert(t("privacyExportTitle"), file.uri);
      await load();
    } catch (error) {
      Alert.alert(t("privacyExportFailed"), error instanceof Error ? error.message : t("operationFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function sendRequest() {
    setLoading(true);
    try {
      await submitPrivacyRequest({ type: requestType, description: requestDescription, password: requestPassword });
      setRequestDescription("");
      setRequestPassword("");
      await load();
      Alert.alert(t("requestReceived"), t("privacyRequestReceived"));
    } catch (error) {
      Alert.alert(t("privacyRequestFailed"), error instanceof Error ? error.message : t("operationFailed"));
    } finally {
      setLoading(false);
    }
  }

  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <PageHeader eyebrow={t("privacyControls")} title={t("privacyData")} description={t("privacyDataDescription")}/>

    <SurfaceCard><Text style={[styles.cardTitle, { color: theme.text }]}>{t("privacyPreferences")}</Text><Text style={[styles.description, { color: theme.muted }]}>{t("privacyPreferencesDescription")}</Text>
      <PreferenceRow title={t("privacyAnalytics")} description={t("privacyAnalyticsDescription")} value={purposeStatuses.get("PRODUCT_ANALYTICS") === "GRANTED" && analyticsEnabled} disabled={loading} onChange={(value) => void togglePurpose("PRODUCT_ANALYTICS", value)}/>
      <PreferenceRow title={t("privacyDiagnostics")} description={t("privacyDiagnosticsDescription")} value={purposeStatuses.get("CRASH_DIAGNOSTICS") === "GRANTED" && diagnosticsEnabled} disabled={loading} onChange={(value) => void togglePurpose("CRASH_DIAGNOSTICS", value)}/>
      <PreferenceRow title={t("privacyMarketing")} description={t("privacyMarketingDescription")} value={purposeStatuses.get("MARKETING_COMMUNICATIONS") === "GRANTED"} disabled={loading} onChange={(value) => void togglePurpose("MARKETING_COMMUNICATIONS", value)}/>
    </SurfaceCard>

    <SurfaceCard><Text style={[styles.cardTitle, { color: theme.text }]}>{t("privacyExportTitle")}</Text><Text style={[styles.description, { color: theme.muted }]}>{t("privacyExportDescription")}</Text><TextField label={t("currentPassword")} secureTextEntry autoComplete="current-password" value={exportPassword} onChangeText={setExportPassword}/><PrimaryButton title={t("privacyRequestExport")} icon="download-outline" loading={loading} disabled={!exportPassword} onPress={queueExport}/>
      {overview?.exports.map((job) => <View key={job.publicId} style={[styles.job, { borderColor: theme.border }]}><View style={styles.jobText}><Text style={[styles.jobId, { color: theme.text }]}>{job.publicId}</Text><Text style={[styles.description, { color: theme.muted }]}>{job.status}</Text></View>{job.status === "READY" ? <Pressable accessibilityRole="button" onPress={() => void download(job.publicId)}><Text style={[styles.link, { color: theme.primary }]}>{t("download")}</Text></Pressable> : null}</View>)}
    </SurfaceCard>

    <SurfaceCard><Text style={[styles.cardTitle, { color: theme.text }]}>{t("privacyRightsRequest")}</Text><View style={styles.chips}>{["ACCESS", "RECTIFICATION", "RESTRICTION", "OBJECTION", "OTHER"].map((type) => <Pressable key={type} onPress={() => setRequestType(type)} style={[styles.chip, { borderColor: requestType === type ? theme.primary : theme.border, backgroundColor: requestType === type ? theme.badge : theme.cardMuted }]}><Text style={{ color: requestType === type ? theme.primary : theme.text, fontWeight: "800" }}>{t(`privacyRequest${type}` as never)}</Text></Pressable>)}</View><TextField label={t("privacyRequestDescription")} multiline value={requestDescription} onChangeText={setRequestDescription} style={styles.multiline}/><TextField label={t("currentPassword")} secureTextEntry autoComplete="current-password" value={requestPassword} onChangeText={setRequestPassword}/><PrimaryButton title={t("privacySubmitRequest")} icon="send-outline" loading={loading} disabled={requestDescription.trim().length < 10 || !requestPassword} onPress={sendRequest}/></SurfaceCard>

    <SurfaceCard><Text style={[styles.cardTitle, { color: theme.text }]}>{t("privacyRequestHistory")}</Text>{overview?.requests.map((item) => <View key={item.publicId} style={[styles.job, { borderColor: theme.border }]}><View style={styles.jobText}><Text style={[styles.jobId, { color: theme.text }]}>{item.publicId}</Text><Text style={[styles.description, { color: theme.muted }]}>{item.type} / {item.status}</Text></View></View>)}</SurfaceCard>
  </ScrollView></Screen>;
}

function PreferenceRow({ title, description, value, disabled, onChange }: { title: string; description: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  const theme = useTheme();
  return <View style={[styles.preference, { borderColor: theme.border }]}><View style={styles.preferenceText}><Text style={[styles.preferenceTitle, { color: theme.text }]}>{title}</Text><Text style={[styles.description, { color: theme.muted }]}>{description}</Text></View><Switch value={value} disabled={disabled} onValueChange={onChange}/></View>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  content: { gap: 16, paddingBottom: 40 },
  cardTitle: { fontSize: 18, fontWeight: "900", marginBottom: 6 },
  description: { fontSize: 13, lineHeight: 19 },
  preference: { alignItems: "center", borderTopWidth: 1, flexDirection: "row", gap: 12, marginTop: 14, paddingTop: 14 },
  preferenceText: { flex: 1, gap: 4 },
  preferenceTitle: { fontSize: 15, fontWeight: "800" },
  job: { alignItems: "center", borderTopWidth: 1, flexDirection: "row", gap: 12, justifyContent: "space-between", marginTop: 14, paddingTop: 14 },
  jobText: { flex: 1, gap: 3 },
  jobId: { fontSize: 13, fontWeight: "900" },
  link: { fontSize: 14, fontWeight: "900" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 14 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  multiline: { minHeight: 110, paddingTop: 14, textAlignVertical: "top" },
});
