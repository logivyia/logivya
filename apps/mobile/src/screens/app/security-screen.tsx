import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { usePreventScreenCapture } from "expo-screen-capture";
import { Ionicons } from "@expo/vector-icons";

import {
  cancelMfaEnrollment,
  confirmEmailMfaEnrollment,
  confirmMfaEnrollment,
  disableMfa,
  getMfaStatus,
  startEmailMfaEnrollment,
  startEmailMfaStepUp,
  startMfaEnrollment,
  type EmailMfaEnrollment,
  type MfaEnrollment,
  type MfaMethodType,
  type MfaStatus,
} from "@/api/mfa-api";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { TextField } from "@/components/text-field";
import { useTranslation } from "@/i18n/use-translation";
import { clearMfaTrustedDeviceToken } from "@/storage/secure-storage";
import { MobileAppLockSettings } from "@/security/mobile-app-lock-settings";
import { useTheme } from "@/theme/theme-provider";

function normalizeSecurityCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9-]/gu, "")
    .slice(0, 64);
}

function isTotpCode(value: string) {
  return /^\d{6}$/u.test(value.trim());
}

function isVerificationCodeReady(value: string) {
  const normalized = value.trim();
  return isTotpCode(normalized) || normalized.replace(/-/gu, "").length >= 16;
}

export function SecurityScreen() {
  usePreventScreenCapture("logivya-security-screen");
  const theme = useTheme();
  const { t } = useTranslation();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [setupCode, setSetupCode] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [secretRevealed, setSecretRevealed] = useState(false);
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [emailEnrollment, setEmailEnrollment] =
    useState<EmailMfaEnrollment | null>(null);
  const [emailPassword, setEmailPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailStepUpToken, setEmailStepUpToken] = useState("");
  const [totpEmailStepUpToken, setTotpEmailStepUpToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const methods = Array.isArray(status?.methods) ? status.methods : [];

  const load = useCallback(async () => {
    setLoadingStatus(true);
    setLoadError(null);
    try {
      setStatus(await getMfaStatus());
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : t("operationFailedError"),
      );
    } finally {
      setLoadingStatus(false);
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);

  async function begin() {
    setBusy(true);
    try {
      const result = await startMfaEnrollment(
        setupPassword,
        status?.enabled ? setupCode : undefined,
      );
      setEnrollment(result);
      setRecoveryCodes([]);
      setEnrollmentCode("");
      setSetupCode("");
      setSecretRevealed(false);
    } catch (error) {
      Alert.alert(
        t("security"),
        error instanceof Error ? error.message : t("operationFailedError"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const result = await confirmMfaEnrollment(
        enrollment!.setupToken,
        enrollmentCode,
      );
      setRecoveryCodes(result.recoveryCodes);
      setEnrollment(null);
      setEnrollmentCode("");
      setSetupPassword("");
      await load();
      Alert.alert(t("security"), t("mfaEnabledSuccess"));
    } catch (error) {
      Alert.alert(
        t("security"),
        error instanceof Error ? error.message : t("operationFailedError"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancelEnrollment() {
    setBusy(true);
    try {
      await cancelMfaEnrollment(enrollment?.setupToken);
      setEnrollment(null);
      setEnrollmentCode("");
      await load();
    } catch (error) {
      Alert.alert(
        t("security"),
        error instanceof Error ? error.message : t("operationFailedError"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function disable(method: MfaMethodType) {
    setBusy(true);
    try {
      const password = method === "TOTP" ? setupPassword : emailPassword;
      const code = method === "TOTP" ? setupCode : emailCode;
      const stepUpToken =
        method === "TOTP" ? totpEmailStepUpToken : emailStepUpToken;
      const verificationMethod = stepUpToken ? "EMAIL_OTP" : "TOTP";
      await disableMfa(
        method,
        password,
        code,
        stepUpToken || undefined,
        verificationMethod,
      );
      await clearMfaTrustedDeviceToken();
      setSetupPassword("");
      setSetupCode("");
      setEmailPassword("");
      setEmailCode("");
      setEmailStepUpToken("");
      setTotpEmailStepUpToken("");
      await load();
    } catch (error) {
      Alert.alert(
        t("security"),
        error instanceof Error ? error.message : t("operationFailedError"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function beginEmailEnrollment() {
    setBusy(true);
    try {
      const result = await startEmailMfaEnrollment(
        emailPassword,
        methods.some((method) => method.type === "TOTP" && method.enabled)
          ? emailCode
          : undefined,
      );
      setEmailEnrollment(result);
      setEmailCode("");
      Alert.alert(t("security"), t("mfaEmailCodeSent"));
    } catch (error) {
      Alert.alert(
        t("security"),
        error instanceof Error ? error.message : t("operationFailedError"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmEmailEnrollmentCode() {
    if (!emailEnrollment) return;
    setBusy(true);
    try {
      await confirmEmailMfaEnrollment(emailEnrollment.setupToken, emailCode);
      setEmailEnrollment(null);
      setEmailPassword("");
      setEmailCode("");
      await load();
      Alert.alert(t("security"), t("mfaEmailEnabledSuccess"));
    } catch (error) {
      Alert.alert(
        t("security"),
        error instanceof Error ? error.message : t("operationFailedError"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendEmailDisableCode(method: MfaMethodType) {
    setBusy(true);
    try {
      const result = await startEmailMfaStepUp();
      if (method === "TOTP") {
        setTotpEmailStepUpToken(result.challengeToken);
        setSetupCode("");
      } else {
        setEmailStepUpToken(result.challengeToken);
        setEmailCode("");
      }
      Alert.alert(
        t("security"),
        t("mfaEmailSent", { email: result.emailMasked }),
      );
    } catch (error) {
      Alert.alert(
        t("security"),
        error instanceof Error ? error.message : t("operationFailedError"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyRecoveryCodes() {
    const value = recoveryCodes.join("\n");
    await Clipboard.setStringAsync(value);
    Alert.alert(t("security"), t("mfaRecoveryCopied"));
    setTimeout(() => {
      void Clipboard.getStringAsync()
        .then((current) =>
          current === value ? Clipboard.setStringAsync("") : undefined,
        )
        .catch(() => undefined);
    }, 60_000);
  }

  async function copyEnrollmentSecret() {
    if (!enrollment?.secret) return;
    const value = enrollment.secret;
    await Clipboard.setStringAsync(value);
    Alert.alert(t("security"), t("mfaSecretCopied"));
    setTimeout(() => {
      void Clipboard.getStringAsync()
        .then((current) =>
          current === value ? Clipboard.setStringAsync("") : undefined,
        )
        .catch(() => undefined);
    }, 60_000);
  }

  if (loadingStatus && !status) {
    return (
      <Screen>
        <LoadingState label={t("security")} />
      </Screen>
    );
  }

  if (loadError && !status) {
    return (
      <Screen>
        <ErrorState title={t("security")} onRetry={() => void load()} />
      </Screen>
    );
  }

  const totpMethod = methods.find((method) => method.type === "TOTP");
  const emailMethod = methods.find((method) => method.type === "EMAIL_OTP");
  const totpEnabled = Boolean(totpMethod?.enabled);
  const emailEnabled = Boolean(emailMethod?.enabled);
  const methodStatus = (method: MfaStatus["methods"][number] | undefined) => {
    if (method?.enabled) return t("mfaEnabled");
    if (method?.status === "PENDING") return t("mfaPendingVerification");
    if (method?.status === "LOCKED") return t("mfaLocked");
    if (method?.status === "REQUIRES_REVERIFICATION")
      return t("mfaRequiresReverification");
    return t("mfaDisabled");
  };
  const securitySummary =
    totpEnabled && emailEnabled
      ? t("mfaSummaryBoth")
      : totpEnabled
        ? t("mfaSummaryTotp")
        : emailEnabled
          ? t("mfaSummaryEmail")
          : t("mfaSummaryPasswordOnly");

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>
            {t("security")}
          </Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            {t("mfaSecurityDescription")}
          </Text>
        </View>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <View style={styles.headingRow}>
            <View
              style={[
                styles.icon,
                {
                  backgroundColor: status?.enabled
                    ? theme.successSoft
                    : theme.cardMuted,
                },
              ]}
            >
              <Ionicons
                name={status?.enabled ? "shield-checkmark" : "shield-outline"}
                size={22}
                color={status?.enabled ? theme.success : theme.primary}
              />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                {t("mfaLoginSecurity")}
              </Text>
              <Text style={[styles.body, { color: theme.muted }]}>
                {securitySummary}
              </Text>
            </View>
          </View>
        </View>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <View style={styles.headingRow}>
            <View
              style={[
                styles.icon,
                {
                  backgroundColor: totpEnabled
                    ? theme.successSoft
                    : theme.cardMuted,
                },
              ]}
            >
              <Ionicons
                name="key-outline"
                size={22}
                color={totpEnabled ? theme.success : theme.primary}
              />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                {t("mfaAuthenticatorMethod")}
              </Text>
              <Text style={[styles.body, { color: theme.muted }]}>
                {methodStatus(totpMethod)}
                {totpMethod?.preferred ? ` · ${t("mfaPreferredMethod")}` : ""}
              </Text>
            </View>
          </View>
          {!totpEnabled && !enrollment && !status?.setupInProgress ? (
            <View style={styles.stack}>
              <TextField
                label={t("password")}
                secureTextEntry
                value={setupPassword}
                onChangeText={setSetupPassword}
              />
              <PrimaryButton
                title={t("mfaEnable")}
                icon="key-outline"
                loading={busy}
                disabled={!setupPassword}
                onPress={begin}
              />
            </View>
          ) : null}
          {status?.setupInProgress && !enrollment ? (
            <View style={styles.stack}>
              <Text style={[styles.body, { color: theme.muted }]}>
                {t("mfaSetupSubtitle")}
              </Text>
              <Pressable
                disabled={busy}
                onPress={() => void cancelEnrollment()}
                style={[styles.secondaryButton, { borderColor: theme.border }]}
              >
                <Text style={[styles.secondaryText, { color: theme.text }]}>
                  {t("cancel")}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {enrollment ? (
            <View style={styles.stack}>
              <View style={styles.qrPanel}>
                <Image
                  accessibilityLabel={t("mfaSetupTitle")}
                  source={{ uri: enrollment.qrCodeDataUrl }}
                  style={styles.qr}
                />
              </View>
              <Text style={[styles.label, { color: theme.muted }]}>
                {t("mfaManualKey")}
              </Text>
              <Text
                selectable={secretRevealed}
                style={[
                  styles.mono,
                  { color: theme.text, backgroundColor: theme.cardMuted },
                ]}
              >
                {secretRevealed
                  ? enrollment.secret
                  : "•••• •••• •••• •••• •••• •••• •••• ••••"}
              </Text>
              <View style={styles.secretActions}>
                <Pressable
                  accessibilityLabel={t(
                    secretRevealed ? "mfaHideSecret" : "mfaShowSecret",
                  )}
                  accessibilityRole="button"
                  onPress={() => setSecretRevealed((visible) => !visible)}
                  style={styles.textButton}
                >
                  <Ionicons
                    name={secretRevealed ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color={theme.primary}
                  />
                  <Text style={{ color: theme.primary, fontWeight: "800" }}>
                    {t(secretRevealed ? "mfaHideSecret" : "mfaShowSecret")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={t("mfaCopySecret")}
                  accessibilityRole="button"
                  onPress={() => void copyEnrollmentSecret()}
                  style={styles.textButton}
                >
                  <Ionicons
                    name="copy-outline"
                    size={18}
                    color={theme.primary}
                  />
                  <Text style={{ color: theme.primary, fontWeight: "800" }}>
                    {t("mfaCopySecret")}
                  </Text>
                </Pressable>
              </View>
              <TextField
                label={t("mfaCode")}
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="one-time-code"
                value={enrollmentCode}
                onChangeText={(value) =>
                  setEnrollmentCode(value.replace(/\D/gu, "").slice(0, 6))
                }
              />
              <PrimaryButton
                title={t("mfaConfirmEnable")}
                loading={busy}
                disabled={!isTotpCode(enrollmentCode)}
                onPress={confirm}
              />
              <Pressable
                disabled={busy}
                onPress={() => void cancelEnrollment()}
                style={[styles.secondaryButton, { borderColor: theme.border }]}
              >
                <Text style={[styles.secondaryText, { color: theme.text }]}>
                  {t("cancel")}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {recoveryCodes.length > 0 ? (
            <View style={styles.stack}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                {t("mfaRecoveryCodes")}
              </Text>
              <Text style={[styles.body, { color: theme.muted }]}>
                {t("mfaRecoveryWarning")}
              </Text>
              <Text
                selectable
                style={[
                  styles.recovery,
                  { color: theme.text, backgroundColor: theme.cardMuted },
                ]}
              >
                {recoveryCodes.join("\n")}
              </Text>
              <Pressable
                accessibilityLabel={t("mfaCopyCodes")}
                accessibilityRole="button"
                onPress={() => void copyRecoveryCodes()}
                style={styles.textButton}
              >
                <Ionicons name="copy-outline" size={18} color={theme.primary} />
                <Text style={{ color: theme.primary, fontWeight: "800" }}>
                  {t("mfaCopyCodes")}
                </Text>
              </Pressable>
              <PrimaryButton
                title={t("continue")}
                onPress={() => setRecoveryCodes([])}
              />
            </View>
          ) : null}
          {totpEnabled && !enrollment ? (
            <View style={styles.stack}>
              <TextField
                label={t("password")}
                secureTextEntry
                value={setupPassword}
                onChangeText={setSetupPassword}
              />
              {emailEnabled && !totpEmailStepUpToken ? (
                <PrimaryButton
                  title={t("mfaSendEmailCode")}
                  icon="mail-outline"
                  loading={busy}
                  disabled={!setupPassword}
                  onPress={() => void sendEmailDisableCode("TOTP")}
                />
              ) : (
                <>
                  <TextField
                    label={t("mfaVerificationCode")}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    keyboardType={
                      totpEmailStepUpToken ? "number-pad" : "default"
                    }
                    maxLength={totpEmailStepUpToken ? 6 : 64}
                    value={setupCode}
                    onChangeText={(value) =>
                      setSetupCode(
                        totpEmailStepUpToken
                          ? value.replace(/\D/gu, "").slice(0, 6)
                          : normalizeSecurityCode(value),
                      )
                    }
                  />
                  <Pressable
                    disabled={
                      busy ||
                      !setupPassword ||
                      (totpEmailStepUpToken
                        ? !isTotpCode(setupCode)
                        : !isVerificationCodeReady(setupCode))
                    }
                    onPress={() =>
                      Alert.alert(
                        t("mfaDisableMethod"),
                        t("mfaDisableConfirm"),
                        [
                          { text: t("cancel"), style: "cancel" },
                          {
                            text: t("mfaDisableMethod"),
                            style: "destructive",
                            onPress: () => void disable("TOTP"),
                          },
                        ],
                      )
                    }
                    style={[
                      styles.dangerButton,
                      { borderColor: theme.danger },
                    ]}
                  >
                    <Text style={[styles.dangerText, { color: theme.danger }]}>
                      {t("mfaDisableMethod")}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : null}
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <View style={styles.headingRow}>
            <View
              style={[
                styles.icon,
                {
                  backgroundColor: emailEnabled
                    ? theme.successSoft
                    : theme.cardMuted,
                },
              ]}
            >
              <Ionicons
                name="mail-outline"
                size={22}
                color={emailEnabled ? theme.success : theme.primary}
              />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                {t("mfaEmailMethod")}
              </Text>
              <Text style={[styles.body, { color: theme.muted }]}>
                {methodStatus(emailMethod)}
                {emailMethod?.preferred ? ` · ${t("mfaPreferredMethod")}` : ""}
              </Text>
              <Text style={[styles.caption, { color: theme.muted }]}>
                {status?.verifiedEmail}
              </Text>
            </View>
          </View>
          {!emailEnabled && !emailEnrollment ? (
            <View style={styles.stack}>
              <TextField
                label={t("password")}
                secureTextEntry
                value={emailPassword}
                onChangeText={setEmailPassword}
              />
              {totpEnabled ? (
                <TextField
                  label={t("mfaCode")}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={emailCode}
                  onChangeText={(value) =>
                    setEmailCode(value.replace(/\D/gu, "").slice(0, 6))
                  }
                />
              ) : null}
              <PrimaryButton
                title={t("mfaEnable")}
                icon="mail-outline"
                loading={busy}
                disabled={
                  !emailPassword || (totpEnabled && !isTotpCode(emailCode))
                }
                onPress={beginEmailEnrollment}
              />
            </View>
          ) : null}
          {emailEnrollment ? (
            <View style={styles.stack}>
              <Text style={[styles.body, { color: theme.muted }]}>
                {t("mfaEmailSent", { email: emailEnrollment.emailMasked })}
              </Text>
              <TextField
                label={t("mfaVerificationCode")}
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="one-time-code"
                value={emailCode}
                onChangeText={(value) =>
                  setEmailCode(value.replace(/\D/gu, "").slice(0, 6))
                }
              />
              <PrimaryButton
                title={t("mfaConfirmEnable")}
                loading={busy}
                disabled={!isTotpCode(emailCode)}
                onPress={confirmEmailEnrollmentCode}
              />
            </View>
          ) : null}
          {emailEnabled ? (
            <View style={styles.stack}>
              <TextField
                label={t("password")}
                secureTextEntry
                value={emailPassword}
                onChangeText={setEmailPassword}
              />
              {emailStepUpToken ? (
                <TextField
                  label={t("mfaVerificationCode")}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={emailCode}
                  onChangeText={(value) =>
                    setEmailCode(value.replace(/\D/gu, "").slice(0, 6))
                  }
                />
              ) : null}
              {!emailStepUpToken ? (
                <PrimaryButton
                  title={t("mfaSendEmailCode")}
                  icon="mail-outline"
                  loading={busy}
                  disabled={!emailPassword}
                  onPress={() => void sendEmailDisableCode("EMAIL_OTP")}
                />
              ) : (
                <Pressable
                  disabled={busy || !emailPassword || !isTotpCode(emailCode)}
                  onPress={() =>
                    Alert.alert(t("mfaDisableMethod"), t("mfaDisableConfirm"), [
                      { text: t("cancel"), style: "cancel" },
                      {
                        text: t("mfaDisableMethod"),
                        style: "destructive",
                        onPress: () => void disable("EMAIL_OTP"),
                      },
                    ])
                  }
                  style={[styles.dangerButton, { borderColor: theme.danger }]}
                >
                  <Text style={[styles.dangerText, { color: theme.danger }]}>
                    {t("mfaDisableMethod")}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}
        </View>

        <MobileAppLockSettings />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18 },
  content: { gap: 16, paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: "900" },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  card: { borderRadius: 18, borderWidth: 1, gap: 16, padding: 16 },
  headingRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  icon: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  flex: { flex: 1 },
  cardTitle: { fontSize: 17, fontWeight: "900" },
  body: { fontSize: 14, lineHeight: 20 },
  stack: { gap: 12 },
  qrPanel: {
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 8,
  },
  qr: { height: 220, width: 220 },
  label: { fontSize: 12, fontWeight: "800" },
  mono: {
    borderRadius: 10,
    fontFamily: "monospace",
    fontSize: 14,
    padding: 12,
  },
  recovery: {
    borderRadius: 10,
    fontFamily: "monospace",
    fontSize: 13,
    lineHeight: 20,
    padding: 12,
  },
  dangerButton: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52,
  },
  dangerText: { fontSize: 15, fontWeight: "900" },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52,
  },
  secondaryText: { fontSize: 15, fontWeight: "800" },
  textButton: { alignItems: "center", flexDirection: "row", gap: 8 },
  secretActions: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  caption: { fontSize: 12, marginTop: 3 },
});
