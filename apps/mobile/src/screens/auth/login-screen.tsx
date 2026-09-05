import { useEffect, useRef, useState } from "react";
import { Alert, Image, Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { GoogleSigninButton } from "@react-native-google-signin/google-signin";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import * as AppleAuthentication from "expo-apple-authentication";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { chooseMfaLoginMethod, completeInitialPasswordChange, completeMfaLogin, finishMfaSetupLogin, login, loginWithSocialIdentity, resendMfaEmailCode } from "@/auth/auth-service";
import { isAppleSignInAvailable, requestAppleIdentityToken, requestGoogleIdentityToken, SocialProviderError, type MobileSocialProvider } from "@/auth/social-provider";
import { ApiRequestError } from "@/api/api-errors";
import { BrandHeader } from "@/components/brand-header";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { useTranslation } from "@/i18n/use-translation";
import { clearPendingMfaChallenge, readPendingMfaChallenge } from "@/storage/secure-storage";
import { colors } from "@/theme/colors";
import { useTheme } from "@/theme/theme-provider";
import type { AuthSessionPayload, MfaLoginChallengePayload, PasswordChangeChallengePayload } from "@/types/api";
import type { AuthStackParamList } from "@/types/navigation";

function getLoginErrorMessage(error: unknown, t: ReturnType<typeof useTranslation>["t"]) {
  if (!(error instanceof Error)) return t("checkYourDetails");
  if (error instanceof ApiRequestError) {
    const key = ({
      INVALID_TEMPORARY_PASSWORD: "temporaryPasswordInvalid",
      PASSWORD_CONFIRMATION_MISMATCH: "passwordConfirmationMismatch",
      PASSWORD_REUSE_NOT_ALLOWED: "passwordReuseNotAllowed",
      PASSWORD_CHANGE_CHALLENGE_EXPIRED: "passwordChangeExpired",
      PASSWORD_CHANGE_CHALLENGE_INVALID: "passwordChangeExpired",
      PASSWORD_TOO_SHORT: "passwordTooShort",
      SOCIAL_ACCOUNT_NOT_FOUND: "socialAccountNotFound",
      SOCIAL_PASSWORD_REQUIRED: "socialPasswordRequired",
      SOCIAL_LOGIN_NOT_CONFIGURED: "socialLoginNotConfigured",
      SOCIAL_TOKEN_INVALID: "socialLoginFailed",
    } as const)[error.code];
    if (key) return t(key);
  }
  const message = error.message || "";
  const technicalSecureStoreError = message.includes("SecureStore") || message.includes("Invalid value provided") || message.includes("Values must be strings");
  return technicalSecureStoreError ? t("secureSessionSaveFailed") : message;
}

export function normalizeMfaLoginCode(value: string, setupRequired: boolean) {
  if (setupRequired) return value.replace(/\D/gu, "").slice(0, 6);
  return value.toUpperCase().replace(/[^A-Z0-9-]/gu, "").slice(0, 64);
}

export function isMfaLoginCodeReady(value: string, setupRequired: boolean) {
  const normalized = value.trim();
  if (setupRequired) return /^\d{6}$/u.test(normalized);
  return /^\d{6}$/u.test(normalized) || normalized.replace(/-/gu, "").length >= 16;
}

export function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const route = useRoute<RouteProp<AuthStackParamList, "Login">>();
  const theme = useTheme();
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const passwordInputRef = useRef<TextInput>(null);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<MobileSocialProvider | null>(null);
  const [appleSignInAvailable, setAppleSignInAvailable] = useState(false);
  const [invitationToken, setInvitationToken] = useState(route.params?.invitationToken);
  const [mfaChallenge, setMfaChallenge] = useState<MfaLoginChallengePayload | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [mfaSetupSession, setMfaSetupSession] = useState<AuthSessionPayload | null>(null);
  const [passwordChallenge, setPasswordChallenge] = useState<PasswordChangeChallengePayload | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("");

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

  useEffect(() => {
    let active = true;
    void isAppleSignInAvailable()
      .then((available) => {
        if (active) setAppleSignInAvailable(available);
      })
      .catch(() => {
        if (active) setAppleSignInAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void readPendingMfaChallenge().then((challenge) => {
      if (active && challenge) setMfaChallenge(challenge);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleLogin() {
    setLoading(true);
    try {
      const challenge = await login(identifier, password, invitationToken);
      if (challenge && "passwordChangeRequired" in challenge) setPasswordChallenge(challenge);
      else if (challenge) setMfaChallenge(challenge);
    } catch (error) {
      Alert.alert(t("loginFailed"), getLoginErrorMessage(error, t));
    } finally {
      setLoading(false);
    }
  }

  async function handleSocialLogin(provider: MobileSocialProvider) {
    setSocialLoading(provider);
    try {
      const credential = provider === "GOOGLE"
        ? await requestGoogleIdentityToken()
        : await requestAppleIdentityToken();
      if (!credential) return;
      const challenge = await loginWithSocialIdentity(
        provider,
        credential.identityToken,
        credential.nonce,
        invitationToken,
      );
      if (challenge && "mfaRequired" in challenge) setMfaChallenge(challenge);
    } catch (error) {
      const message = error instanceof SocialProviderError
        ? t(error.code === "NOT_CONFIGURED" ? "socialLoginNotConfigured" : "socialProviderUnavailable")
        : getLoginErrorMessage(error, t);
      Alert.alert(t("socialLoginFailedTitle"), message);
    } finally {
      setSocialLoading(null);
    }
  }

  async function handlePasswordChange() {
    if (!passwordChallenge) return;
    if (newPassword !== newPasswordConfirmation) {
      Alert.alert(t("passwordChangeTitle"), t("passwordConfirmationMismatch"));
      return;
    }
    setLoading(true);
    try {
      await completeInitialPasswordChange(passwordChallenge, password, newPassword, newPasswordConfirmation);
      const challenge = await login(identifier, newPassword, invitationToken);
      setPassword("");
      setNewPassword("");
      setNewPasswordConfirmation("");
      setPasswordChallenge(null);
      if (challenge && "mfaRequired" in challenge) setMfaChallenge(challenge);
    } catch (error) {
      Alert.alert(t("passwordChangeTitle"), getLoginErrorMessage(error, t));
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

  async function handleMfaMethod(method: "TOTP" | "EMAIL_OTP") {
    if (!mfaChallenge) return;
    setLoading(true);
    try { setMfaChallenge(await chooseMfaLoginMethod(mfaChallenge, method)); setMfaCode(""); }
    catch (error) { Alert.alert(t("loginFailed"), getLoginErrorMessage(error, t)); }
    finally { setLoading(false); }
  }

  async function handleEmailResend() {
    if (!mfaChallenge) return;
    setLoading(true);
    try { setMfaChallenge(await resendMfaEmailCode(mfaChallenge)); }
    catch (error) { Alert.alert(t("loginFailed"), getLoginErrorMessage(error, t)); }
    finally { setLoading(false); }
  }

  async function finishMfaSetup() {
    if (!mfaSetupSession) return;
    setLoading(true);
    try { await finishMfaSetupLogin(mfaSetupSession, invitationToken); }
    catch (error) { Alert.alert(t("loginFailed"), getLoginErrorMessage(error, t)); setLoading(false); }
  }

  async function copyRecoveryCodes() {
    if (!mfaSetupSession?.recoveryCodes?.length) return;
    const value = mfaSetupSession.recoveryCodes.join("\n");
    await Clipboard.setStringAsync(value);
    setTimeout(() => {
      void Clipboard.getStringAsync().then((current) => current === value ? Clipboard.setStringAsync("") : undefined).catch(() => undefined);
    }, 60_000);
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
      <ScrollView
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        <BrandHeader />
        {passwordChallenge ? (
          <View style={styles.form}>
            <Text style={[styles.title, { color: theme.text }]}>{t("passwordChangeTitle")}</Text>
            <Text style={[styles.subtitle, { color: theme.muted }]}>{t("passwordChangeDescription")}</Text>
            <TextField label={t("temporaryPassword")} secureTextEntry value={password} onChangeText={setPassword} />
            <TextField label={t("newPassword")} secureTextEntry value={newPassword} onChangeText={setNewPassword} />
            <TextField label={t("newPasswordConfirmation")} secureTextEntry value={newPasswordConfirmation} onChangeText={setNewPasswordConfirmation} />
            <Text style={[styles.recoveryWarning, { color: theme.muted }]}>{t("passwordPolicy")}</Text>
            <PrimaryButton
              title={t("changePasswordAndContinue")}
              loading={loading}
              disabled={!password || !newPassword || !newPasswordConfirmation}
              onPress={handlePasswordChange}
            />
          </View>
        ) : mfaChallenge ? (
          <View style={styles.form}>
            {mfaSetupSession?.recoveryCodes?.length ? <>
              <Text style={[styles.title, { color: theme.text }]}>{t("mfaRecoveryCodes")}</Text>
              <Text style={[styles.subtitle, { color: theme.muted }]}>{t("mfaRecoveryWarning")}</Text>
              <View style={[styles.detailPanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text selectable style={[styles.recoveryCodes, { color: theme.text }]}>{mfaSetupSession.recoveryCodes.join("\n")}</Text>
              </View>
              <PrimaryButton title={t("mfaCopyCodes")} icon="copy-outline" onPress={() => void copyRecoveryCodes()} />
              <PrimaryButton title={t("continue")} loading={loading} onPress={finishMfaSetup} />
            </> : <>
            <Text style={[styles.title, { color: theme.text }]}>{t(mfaChallenge.mfaSetupRequired ? "mfaSetupTitle" : "mfaTitle")}</Text>
            <Text style={[styles.subtitle, { color: theme.muted }]}>{t(mfaChallenge.mfaSetupRequired ? "mfaSetupSubtitle" : "mfaSubtitle")}</Text>
            {!mfaChallenge.selectedMethod ? <View style={styles.methodList}>
              <Text style={[styles.smallLabel, { color: theme.muted }]}>{t("mfaChooseMethod")}</Text>
              {mfaChallenge.availableMethods.map((method) => <PrimaryButton key={method} title={t(method === "TOTP" ? "mfaAuthenticatorMethod" : "mfaEmailMethod")} loading={loading} onPress={() => void handleMfaMethod(method)} />)}
            </View> : null}
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
            {mfaChallenge.selectedMethod ? <>
            {mfaChallenge.selectedMethod === "EMAIL_OTP" && mfaChallenge.emailMasked ? <Text style={[styles.emailNotice, { color: theme.muted, borderColor: theme.border }]}>{t("mfaEmailSent").replace("{email}", mfaChallenge.emailMasked)}</Text> : null}
            <TextField
              label={t("mfaCode")}
              keyboardType={mfaChallenge.selectedMethod === "EMAIL_OTP" || mfaChallenge.mfaSetupRequired ? "number-pad" : "default"}
              maxLength={mfaChallenge.selectedMethod === "EMAIL_OTP" || mfaChallenge.mfaSetupRequired ? 6 : 64}
              autoComplete="one-time-code"
              autoCapitalize="characters"
              autoCorrect={false}
              value={mfaCode}
              onChangeText={(value) => setMfaCode(normalizeMfaLoginCode(value, mfaChallenge.selectedMethod === "EMAIL_OTP" || mfaChallenge.mfaSetupRequired))}
            />
            {mfaChallenge.availableMethods.filter((method) => method !== mfaChallenge.selectedMethod).map((method) => <Pressable key={method} onPress={() => void handleMfaMethod(method)} style={styles.centerLink}><Text style={{ color: theme.primary }}>{t("mfaUseAnotherMethod")}: {t(method === "TOTP" ? "mfaAuthenticatorMethod" : "mfaEmailMethod")}</Text></Pressable>)}
            {mfaChallenge.selectedMethod === "EMAIL_OTP" ? <Pressable onPress={() => void handleEmailResend()} style={styles.centerLink}><Text style={{ color: theme.primary }}>{t("mfaResendEmail")}</Text></Pressable> : null}
            <View style={styles.rememberRow}>
              <Text style={[styles.rememberText, { color: theme.text }]}>{t("mfaRememberDevice")}</Text>
              <Switch value={rememberDevice} onValueChange={setRememberDevice} />
            </View>
            <PrimaryButton title={t("mfaVerify")} loading={loading} disabled={!isMfaLoginCodeReady(mfaCode, mfaChallenge.selectedMethod === "EMAIL_OTP" || mfaChallenge.mfaSetupRequired)} onPress={handleMfaVerification} />
            </> : null}
            <Pressable onPress={() => { void clearPendingMfaChallenge(); setMfaChallenge(null); setMfaCode(""); }} style={styles.centerLink}>
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
            <TextField
              label={t(Platform.OS === "ios" ? "email" : "emailOrPhone")}
              autoCapitalize="none"
              autoComplete={Platform.OS === "ios" ? "email" : undefined}
              keyboardType={Platform.OS === "ios" ? "email-address" : "default"}
              returnKeyType="next"
              blurOnSubmit={false}
              value={identifier}
              onChangeText={setIdentifier}
              onSubmitEditing={() => passwordInputRef.current?.focus()}
            />
            <TextField
              ref={passwordInputRef}
              label={t("password")}
              secureTextEntry
              returnKeyType="done"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={() => {
                Keyboard.dismiss();
                if (identifier && password && !loading) void handleLogin();
              }}
            />
            <Pressable onPress={() => navigation.navigate("ForgotPassword")} style={styles.linkWrap}>
              <Text style={[styles.link, { color: theme.primary }]}>{t("forgotPassword")}</Text>
            </Pressable>
            <PrimaryButton title={t("login")} loading={loading} disabled={!identifier || !password} onPress={() => { Keyboard.dismiss(); void handleLogin(); }} />
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <Text style={[styles.dividerText, { color: theme.muted }]}>{t("or")}</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            </View>
            <View style={styles.socialButtons}>
              <GoogleSigninButton
                accessibilityLabel={t("continueWithGoogle")}
                color={GoogleSigninButton.Color.Dark}
                disabled={loading || socialLoading !== null}
                onPress={() => void handleSocialLogin("GOOGLE")}
                size={GoogleSigninButton.Size.Wide}
                style={styles.googleButton}
              />
              {appleSignInAvailable ? (
                <AppleAuthentication.AppleAuthenticationButton
                  accessibilityLabel={t("continueWithApple")}
                  buttonStyle={theme.mode === "dark"
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  cornerRadius={8}
                  onPress={() => {
                    if (!loading && socialLoading === null) void handleSocialLogin("APPLE");
                  }}
                  style={[styles.appleButton, socialLoading !== null || loading ? styles.socialButtonDisabled : null]}
                />
              ) : null}
              {socialLoading ? (
                <Text style={[styles.socialLoadingText, { color: theme.muted }]}>{t("socialLoginInProgress")}</Text>
              ) : null}
            </View>
            <Pressable onPress={() => navigation.navigate("Register", invitationToken ? { invitationToken } : undefined)} style={styles.centerLink}>
              <Text style={{ color: theme.muted }}>{t("newToLogivya")} <Text style={{ color: theme.primary }}>{t("createAccountAction")}</Text></Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  container: { flexGrow: 1, justifyContent: "center", paddingBottom: 24, paddingTop: 32 },
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
  methodList: { gap: 10 },
  emailNotice: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14 },
  dividerRow: { alignItems: "center", flexDirection: "row", gap: 12, marginVertical: 2 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 14, fontWeight: "700" },
  socialButtons: { alignItems: "center", gap: 10 },
  googleButton: { backgroundColor: colors.navy, borderRadius: 8, height: 50, overflow: "hidden", width: "100%" },
  appleButton: { height: 50, width: "100%" },
  socialButtonDisabled: { opacity: 0.55 },
  socialLoadingText: { fontSize: 13, fontWeight: "600" },
});
