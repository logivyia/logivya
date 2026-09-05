import { productStatusCopy, lifecycleLabel } from "../../../../../shared/product-status-copy";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { cancelAccountDeletion, getAccountDeletionRequests, requestAccountDeletion } from "@/api/privacy-api";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { colors } from "@/theme/colors";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import { useAuthStore } from "@/auth/auth-store";
import { logout } from "@/auth/auth-service";

export function AccountDeletionScreen() {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const copy = productStatusCopy(locale);
  const [executionEnabled, setExecutionEnabled] = useState(false);
  const isOwner = useAuthStore((state) => state.user?.role === "OWNER");
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [scope, setScope] = useState<"USER" | "COMPANY">("USER");
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<Array<{ publicId: string; scope: string; status: string; cancelUntil: string }>>([]);
  const confirmationText = scope === "COMPANY" ? t("companyDeletionPhrase") : t("accountDeletionPhrase");
  const canSubmit = confirmation === confirmationText && Boolean(password);

  const load = useCallback(async () => {
    const result = await getAccountDeletionRequests();
    setJobs(result.jobs);
    setExecutionEnabled(result.destructiveExecutionEnabled === true);
  }, []);

  useEffect(() => { void load().catch(() => undefined); }, [load]);

  async function submit() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const result = await requestAccountDeletion({ scope, confirmation: scope === "COMPANY" ? "DELETE MY LOGIVYA WORKSPACE" : "DELETE MY LOGIVYA ACCOUNT", password });
      setConfirmation("");
      setPassword("");
      if (result.scope === "MEMBERSHIP") {
        Alert.alert(t("requestReceived"), t("sharedMembershipDeleteScope"));
        await logout();
        return;
      }
      await load();
      Alert.alert(t("requestReceived"), executionEnabled ? t("deletionQueuedDescription") : copy.deletionHelp);
    } catch (error) {
      Alert.alert(t("accountDeleteFailed"), error instanceof Error ? error.message : t("operationFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function cancel(publicId: string) {
    if (!password) return Alert.alert(t("currentPassword"), t("passwordRequired"));
    setLoading(true);
    try {
      await cancelAccountDeletion(publicId, password);
      await load();
      Alert.alert(t("requestReceived"), t("deletionCanceledDescription"));
    } catch (error) {
      Alert.alert(t("accountDeleteFailed"), error instanceof Error ? error.message : t("operationFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.warningCard, { backgroundColor: theme.card, borderColor: colors.danger }]}>
          <Text style={[styles.title, { color: theme.text }]}>{t("deleteAccount")}</Text>
          <Text style={[styles.description, { color: theme.muted }]}>
            {t(isOwner ? "accountDeleteFullWarning" : "sharedMembershipDeleteScope")}
          </Text>
          {isOwner && !executionEnabled ? <Text style={[styles.description, { color: theme.text }]}>{copy.deletionHelp}</Text> : null}
          {isOwner ? (
            <View style={styles.scopeRow}><ScopeButton label={t("userAccountScope")} active={scope === "USER"} onPress={() => { setScope("USER"); setConfirmation(""); }}/><ScopeButton label={t("companyAccountScope")} active={scope === "COMPANY"} onPress={() => { setScope("COMPANY"); setConfirmation(""); }}/></View>
          ) : null}
          <Text style={[styles.confirmationLabel, { color: theme.text }]}>{t("confirmationPrompt")}</Text>
          <Text style={[styles.confirmationText, { color: colors.danger }]}>{confirmationText}</Text>
          <TextField label={t("confirmationTextLabel")} value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" />
          <TextField label={t("currentPassword")} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
        </View>
        <PrimaryButton title={t("submitDeletionRequest")} loading={loading} disabled={!canSubmit} onPress={submit} />
        {jobs.map((job) => <View key={job.publicId} style={[styles.job, { backgroundColor: theme.card, borderColor: theme.border }]}><View style={styles.jobText}><Text style={[styles.jobId, { color: theme.text }]}>{job.publicId}</Text><Text style={[styles.description, { color: theme.muted }]}>{t(job.scope === "COMPANY" ? "companyAccountScope" : "userAccountScope")} / {lifecycleLabel(job.status, locale)}</Text><Text style={[styles.description, { color: theme.muted }]}>{copy.cancelDeadline}: {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(job.cancelUntil))}</Text></View>{job.status === "QUEUED" ? <Pressable disabled={loading || Date.parse(job.cancelUntil) <= Date.now()} onPress={() => void cancel(job.publicId)}><Text style={[styles.cancel, { color: theme.danger }]}>{t("cancelRequest")}</Text></Pressable> : null}</View>)}
      </ScrollView>
    </Screen>
  );
}

function ScopeButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable onPress={onPress} style={[styles.scopeButton, { backgroundColor: active ? theme.badge : theme.cardMuted, borderColor: active ? theme.primary : theme.border }]}><Text style={{ color: active ? theme.primary : theme.text, fontWeight: "800" }}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  content: { gap: 16, paddingBottom: 32 },
  warningCard: { borderWidth: 1, borderRadius: 24, gap: 14, padding: 18 },
  title: { fontSize: 26, fontWeight: "900" },
  description: { fontSize: 14, lineHeight: 21 },
  confirmationLabel: { fontSize: 14, fontWeight: "900" },
  confirmationText: { fontSize: 15, fontWeight: "900" }
  ,scopeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 }
  ,scopeButton: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 10 }
  ,job: { alignItems: "center", borderWidth: 1, borderRadius: 18, flexDirection: "row", gap: 12, padding: 14 }
  ,jobText: { flex: 1, gap: 4 }
  ,jobId: { fontSize: 13, fontWeight: "900" }
  ,cancel: { fontSize: 14, fontWeight: "900" }
});
