import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Alert, Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { validatePasswordPolicy } from "@logivya/validation/password-policy";

import { register } from "@/auth/auth-service";
import { BrandHeader } from "@/components/brand-header";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { useTranslation } from "@/i18n/use-translation";
import { colors } from "@/theme/colors";
import { useTheme } from "@/theme/theme-provider";
import type { AuthStackParamList } from "@/types/navigation";

export function RegisterScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const route = useRoute<RouteProp<AuthStackParamList, "Register">>();
  const theme = useTheme();
  const { t } = useTranslation();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptKvkk, setAcceptKvkk] = useState(false);
  const [loading, setLoading] = useState(false);
  const emailInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const passwordConfirmationInputRef = useRef<TextInput>(null);
  const [invitationToken, setInvitationToken] = useState<string | undefined>(route.params?.invitationToken);
  const passwordPolicy = validatePasswordPolicy(password);
  const passwordsMatch = password === passwordConfirmation;
  const phoneRequired = Platform.OS !== "ios";
  const canSubmit = Boolean(fullName && email && (!phoneRequired || phone.trim()) && passwordPolicy.valid && passwordsMatch && acceptTerms && acceptPrivacy && acceptKvkk);

  function openLegalUrl(path: string) {
    void Linking.openURL(`https://www.logivya.com${path}`);
  }

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

  async function handleRegister() {
    if (!passwordPolicy.valid) {
      Alert.alert(t("registrationFailed"), t(passwordPolicy.code === "PASSWORD_REQUIRED" ? "passwordRequired" : passwordPolicy.code === "PASSWORD_TOO_SHORT" ? "passwordTooShort" : "passwordInvalidType"));
      return;
    }
    if (!passwordsMatch) {
      Alert.alert(t("registrationFailed"), t("passwordConfirmationMismatch"));
      return;
    }
    if (!acceptTerms || !acceptPrivacy || !acceptKvkk) {
      Alert.alert(t("approvalRequired"), t("legalAcceptanceRequired"));
      return;
    }

    setLoading(true);
    try {
      await register({
        fullName,
        email,
        phone,
        password,
        passwordConfirmation,
        acceptTerms,
        acceptPrivacy,
        acceptKvkk,
        ...(invitationToken ? { invitationToken } : {}),
      });
      setPassword("");
      setPasswordConfirmation("");
    } catch (error) {
      Alert.alert(t("registrationFailed"), error instanceof Error ? error.message : t("checkYourDetails"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <ScrollView
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          contentContainerStyle={styles.scroll}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
        >
          <BrandHeader />
          <View style={styles.form}>
          <Text style={[styles.title, { color: theme.text }]}>{t("registerTitle")}</Text>
          {invitationToken ? <Text style={[styles.invitationNotice, { color: theme.primary }]}>{t("invitationRegistration")}</Text> : null}
          <TextField
            label={t("fullName")}
            value={fullName}
            onChangeText={setFullName}
            blurOnSubmit={false}
            returnKeyType="next"
            onSubmitEditing={() => emailInputRef.current?.focus()}
          />
          <TextField
            ref={emailInputRef}
            label={t("email")}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            blurOnSubmit={false}
            returnKeyType="next"
            onSubmitEditing={() => phoneInputRef.current?.focus()}
          />
          <TextField
            ref={phoneInputRef}
            label={t("phone")}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            blurOnSubmit={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordInputRef.current?.focus()}
          />
          <TextField
            ref={passwordInputRef}
            label={t("password")}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            blurOnSubmit={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordConfirmationInputRef.current?.focus()}
          />
          <Text style={[styles.passwordHint, { color: theme.muted }]}>{t("passwordPolicy")}</Text>
          <TextField
            ref={passwordConfirmationInputRef}
            label={t("passwordConfirmation")}
            secureTextEntry
            value={passwordConfirmation}
            onChangeText={setPasswordConfirmation}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
          {passwordConfirmation && !passwordsMatch ? <Text style={styles.validationError}>{t("passwordConfirmationMismatch")}</Text> : null}
          <View style={[styles.consentBox, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <ConsentRow
              checked={acceptTerms}
              label={t("acceptLabel")}
              linkLabel={t("termsOfService")}
              onToggle={() => setAcceptTerms((value) => !value)}
              onOpenLink={() => openLegalUrl("/terms-of-service")}
            />
            <ConsentRow
              checked={acceptPrivacy}
              label={t("acceptLabel")}
              linkLabel={t("privacyPolicy")}
              onToggle={() => setAcceptPrivacy((value) => !value)}
              onOpenLink={() => openLegalUrl("/privacy-policy")}
            />
            <ConsentRow
              checked={acceptKvkk}
              label={t("readAndAcceptLabel")}
              linkLabel={t("dataProcessingNotice")}
              onToggle={() => setAcceptKvkk((value) => !value)}
              onOpenLink={() => openLegalUrl("/kvkk")}
            />
          </View>
          <PrimaryButton title={t("register")} loading={loading} disabled={!canSubmit} onPress={() => { Keyboard.dismiss(); void handleRegister(); }} />
          <Pressable onPress={() => navigation.navigate("Login", invitationToken ? { invitationToken } : undefined)} style={styles.centerLink}>
            <Text style={{ color: theme.muted }}>{t("alreadyHaveAccount")} <Text style={{ color: theme.primary }}>{t("signInAction")}</Text></Text>
          </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ConsentRow({
  checked,
  label,
  linkLabel,
  onToggle,
  onOpenLink
}: {
  checked: boolean;
  label: string;
  linkLabel: string;
  onToggle: () => void;
  onOpenLink: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.consentRow}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={onToggle}
        style={[styles.checkbox, { borderColor: checked ? colors.success : theme.border, backgroundColor: checked ? colors.success : "transparent" }]}
      >
        {checked ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
      </Pressable>
      <Text style={[styles.consentText, { color: theme.muted }]}>
        {label}{" "}
        <Text style={{ color: theme.primary, fontWeight: "800" }} onPress={onOpenLink}>
          {linkLabel}
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center"
  },
  form: {
    gap: 16
  },
  title: {
    fontSize: 30,
    fontWeight: "800"
  },
  invitationNotice: {
    fontSize: 14,
    fontWeight: "800"
  },
  passwordHint: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: -8
  },
  validationError: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -8
  },
  consentBox: {
    borderWidth: 1,
    borderRadius: 18,
    gap: 12,
    padding: 14
  },
  consentRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10
  },
  checkbox: {
    alignItems: "center",
    borderRadius: 6,
    borderWidth: 1.5,
    height: 24,
    justifyContent: "center",
    marginTop: 1,
    width: 24
  },
  consentText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19
  },
  centerLink: {
    alignItems: "center",
    paddingTop: 8
  }
});
