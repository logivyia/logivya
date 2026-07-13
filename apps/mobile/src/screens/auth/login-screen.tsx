import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { login } from "@/auth/auth-service";
import { BrandHeader } from "@/components/brand-header";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { AuthStackParamList } from "@/types/navigation";

function getLoginErrorMessage(error: unknown, t: ReturnType<typeof useTranslation>["t"]) {
  if (!(error instanceof Error)) return t("checkYourDetails");

  const message = error.message || "";
  const technicalSecureStoreError =
    message.includes("SecureStore") ||
    message.includes("Invalid value provided") ||
    message.includes("Values must be strings");

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
  const [invitationCode, setInvitationCode] = useState(route.params?.invitationCode ?? "");

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
      await login(identifier, password, invitationToken, invitationCode.trim() || undefined);
    } catch (error) {
      Alert.alert(t("loginFailed"), getLoginErrorMessage(error, t));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen style={styles.container}>
      <BrandHeader />
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
        {!invitationToken ? (
          <TextField
            label={t("invitationCodeOptional")}
            autoCapitalize="characters"
            value={invitationCode}
            placeholder="ABCD-EFGH-JKLM-NPQR"
            onChangeText={setInvitationCode}
          />
        ) : null}
        <TextField label={t("emailOrPhone")} autoCapitalize="none" value={identifier} onChangeText={setIdentifier} />
        <TextField label={t("password")} secureTextEntry value={password} onChangeText={setPassword} />
        <Pressable onPress={() => navigation.navigate("ForgotPassword")} style={styles.linkWrap}>
          <Text style={[styles.link, { color: theme.primary }]}>{t("forgotPassword")}</Text>
        </Pressable>
        <PrimaryButton title={t("login")} loading={loading} disabled={!identifier || !password} onPress={handleLogin} />
        <Pressable onPress={() => navigation.navigate("Register", invitationToken ? { invitationToken } : invitationCode.trim() ? { invitationCode: invitationCode.trim() } : undefined)} style={styles.centerLink}>
          <Text style={{ color: theme.muted }}>
            {t("newToLogivya")} {" "}
            <Text style={{ color: theme.primary }}>{t("createAccountAction")}</Text>
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center"
  },
  form: {
    gap: 16
  },
  title: {
    fontSize: 30,
    fontWeight: "800"
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 8
  },
  linkWrap: {
    alignItems: "flex-end"
  },
  link: {
    fontSize: 15,
    fontWeight: "700"
  },
  centerLink: {
    alignItems: "center",
    paddingTop: 8
  },
  invitationNotice: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    padding: 12
  },
  invitationText: {
    fontSize: 14,
    fontWeight: "700"
  },
  invitationDismiss: {
    fontSize: 13,
    fontWeight: "800"
  }
});
