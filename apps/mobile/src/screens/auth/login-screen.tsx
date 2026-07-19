import { useEffect, useState } from "react";
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { completeMfaLogin, finishMfaSetupLogin, login } from "@/auth/auth-service";
import { BrandHeader } from "@/components/brand-header";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { AuthSessionPayload, MfaLoginChallengePayload } from "@/types/api";
import type { AuthStackParamList } from "@/types/navigation";

function getLoginErrorMessage(error: unknown, t: ReturnType<typeof useTranslation>["t"]) {
  if (!(error instanceof Error)) return t("checkYourDetails");
  const message = error.message || "";
  const technicalSecureStoreError = message.includes("SecureStore") || message.includes("Invalid value provided") || message.includes("Values must be strings");
  return technicalSecureStoreError ? t("secureSessionSaveFailed") : message;
}

export function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const route = useRoute<RouteProp<AuthStackParamList, "Login">>();
  const theme = useTheme();
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [invitationToken, setInvitationToken] = useState(route.params?.invitationToken);
  const [mfaChallenge, setMfaChallenge] = useState<MfaLoginChallengePayload | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [mfaSetupSession, setMfaSetupSession] = useState<AuthSessionPayload | null>(null);

  useEffect(() => {
    function captureInvitation(url: string | null) {
      if (!url) return;
      try {
        const token = new URL(url).searchParams.get("invitation")?.trim();
        if (token && token.length >= 32) setInvitationToken(token);
      } catch {
        // Ignore unrelated deep links.
      }
    }
    void Linking.getInitialURL().then(captureInvitation);
    const subscription = Linking.addEventListener("url", ({ url }) => captureInvitation(url));
    return () => subscription.remove();
  }, []);

  async function handleLogin() {
    setLoading(true);
    try {
      const challenge = await login(identifier, password, invitationToken);
      if (challenge) setMfaChallenge(challenge);
    } catch (error) {
      Alert.alert(t("loginFailed"), getLoginErrorMessage(error, t));
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaVerification() {
    if (!mfaChallenge) return;
    setLoading(true);
    try {
      const pendingSession = await completeMfaLogin(mfaChallenge, mfaCode, rememberDevice, invitationToken);
      if (pendingSession) setMfaSetupSession(pendingSession);
    } catch (error) {
      Alert.alert(t("loginFailed"), getLoginErrorMessage(error, t));
    } finally {
      setLoading(false);
    }
  }

  async function finishMfaSetup() {
    if (!mfaSetupSession) return;
    setLoading(true);
    try { await finishMfaSetupLogin(mfaSetupSession, invitationToken); }
    catch (error) { Alert.alert(t("loginFailed"), getLoginErrorMessage(error, t)); setLoading(false); }
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container}>
        <BrandHeader />
        {mfaChallenge ? (
          <View style={styles.form}>
            {mfaSetupSession?.recoveryCodes?.length ? <>
              <Text style={[styles.title, { color: theme.text }]}>{t("mfaRecoveryCodes")}</Text>
              <Text style={[styles.subtitle, { color: theme.muted }]}>{t("mfaRecoveryWarning")}</Text>
              <View style={[styles.detailPanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text selectable style={[styles.recoveryCodes, { color: theme.text }]}>{mfaSetupSession.recoveryCodes.join("\n")}</Text>
              </View>
              <PrimaryButton title={t("mfaCopyCodes")} icon="copy-outline" onPress={() => void Clipboard.setStringAsync(mfaSetupSession.recoveryCodes!.join("\n"))} />
              <PrimaryButton title={t("continue")} loading={loading} onPress={finishMfaSetup} />
            </> : <>
            <Text style={[styles.title, { color: theme.text }]}>{t(mfaChallenge.mfaSetupRequired ? "mfaSetupTitle" : "mfaTitle")}</Text>
            <Text style={[styles.subtitle, { color: theme.muted }]}>{t(mfaChallenge.mfaSetupRequired ? "mfaSetupSubtitle" : "mfaSubtitle")}</Text>
            {mfaChallenge.qrCodeDataUrl ? (
              <View style={[styles.qrPanel, { borderColor: theme.border }]}>
                <Image source={{ uri: mfaChallenge.qrCodeDataUrl }} style={styles.qrCode} resizeMode="contain" accessibilityLabel={t("mfaSetupTitle")} />
              </View>
            ) : null}
            {mfaChallenge.secret ? (
              <View style={[styles.detailPanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[styles.smallLabel, { color: theme.muted }]}>{t("mfaManualKey")}</Text>
                <Text selectable style={[styles.secret, { color: theme.text }]}>{mfaChallenge.secret}</Text>
              </View>
            ) : null}
            <TextField label={t("mfaCode")} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" autoCapitalize="none" autoCorrect={false} value={mfaCode} onChangeText={(value) => setMfaCode(value.replace(/\D/gu, "").slice(0, 6))} />
            <View style={styles.rememberRow}>
              <Text style={[styles.rememberText, { color: theme.text }]}>{t("mfaRememberDevice")}</Text>
              <Switch value={rememberDevice} onValueChange={setRememberDevice} />
            </View>
            <PrimaryButton title={t("mfaVerify")} loading={loading} disabled={mfaCode.trim().length < 6} onPress={handleMfaVerification} />
            <Pressable onPress={() => { setMfaChallenge(null); setMfaCode(""); }} style={styles.centerLink}>
              <Text style={{ color: theme.primary }}>{t("mfaBackToLogin")}</Text>
            </Pressable>
            </>}
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={[styles.title, { color: theme.text }]}>{t("loginTitle")}</Text>
            <Text style={[styles.subtitle, { color: theme.muted }]}>{t("loginSubtitle")}</Text>
            {invitationToken ? (
              <View style={[styles.invitationNotice, { borderColor: theme.border, backgroundColor: theme.card }]}>
                <Text style={[styles.invitationText, { color: theme.text }]}>{t("invitationLoginPrompt")}</Text>
                <Pressable onPress={() => setInvitationToken(undefined)}>
                  <Text style={[styles.invitationDismiss, { color: theme.primary }]}>{t("regularLogin")}</Text>
                </Pressable>
              </View>
            ) : null}
            <TextField label={t("emailOrPhone")} autoCapitalize="none" value={identifier} onChangeText={setIdentifier} />
            <TextField label={t("password")} secureTextEntry value={password} onChangeText={setPassword} />
            <Pressable onPress={() => navigation.navigate("ForgotPassword")} style={styles.linkWrap}>
              <Text style={[styles.link, { color: theme.primary }]}>{t("forgotPassword")}</Text>
            </Pressable>
            <PrimaryButton title={t("login")} loading={loading} disabled={!identifier || !password} onPress={handleLogin} />
            <Pressable onPress={() => navigation.navigate("Register", invitationToken ? { invitationToken } : undefined)} style={styles.centerLink}>
              <Text style={{ color: theme.muted }}>{t("newToLogivya")} <Text style={{ color: theme.primary }}>{t("createAccountAction")}</Text></Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", paddingBottom: 24 },
  form: { gap: 16 },
  title: { fontSize: 30, fontWeight: "800" },
  subtitle: { fontSize: 16, marginBottom: 8 },
  linkWrap: { alignItems: "flex-end" },
  link: { fontSize: 15, fontWeight: "700" },
  centerLink: { alignItems: "center", paddingTop: 8 },
  invitationNotice: { borderRadius: 14, borderWidth: 1, gap: 6, padding: 12 },
  invitationText: { fontSize: 14, fontWeight: "700" },
  invitationDismiss: { fontSize: 13, fontWeight: "800" },
  qrPanel: { alignItems: "center", alignSelf: "center", backgroundColor: "#FFFFFF", borderRadius: 8, borderWidth: 1, padding: 10 },
  qrCode: { height: 220, width: 220 },
  detailPanel: { borderRadius: 14, borderWidth: 1, gap: 6, padding: 12 },
  smallLabel: { fontSize: 13, fontWeight: "800" },
  secret: { fontFamily: "monospace", fontSize: 15, lineHeight: 22 },
  recoveryWarning: { fontSize: 13, lineHeight: 18 },
  recoveryCodes: { fontFamily: "monospace", fontSize: 13, lineHeight: 20 },
  rememberRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 48 },
  rememberText: { flex: 1, fontSize: 15, fontWeight: "700", paddingRight: 12 },
});
