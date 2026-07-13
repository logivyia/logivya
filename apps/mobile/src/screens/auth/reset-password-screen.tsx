import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { validatePasswordPolicy } from "@logivya/validation/password-policy";

import { resetPasswordRequest } from "@/api/auth-api";
import { BrandHeader } from "@/components/brand-header";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { AuthStackParamList } from "@/types/navigation";

export function ResetPasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const route = useRoute<RouteProp<AuthStackParamList, "ResetPassword">>();
  const theme = useTheme();
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState(route.params?.identifier ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const passwordPolicy = validatePasswordPolicy(password);
  const passwordsMatch = password === confirmPassword;

  async function handleReset() {
    if (!passwordPolicy.valid) {
      Alert.alert(t("passwordUpdateFailed"), t(passwordPolicy.code === "PASSWORD_REQUIRED" ? "passwordRequired" : passwordPolicy.code === "PASSWORD_TOO_SHORT" ? "passwordTooShort" : "passwordInvalidType"));
      return;
    }
    if (!passwordsMatch) {
      Alert.alert(t("passwordUpdateFailed"), t("passwordConfirmationMismatch"));
      return;
    }
    setLoading(true);
    try {
      await resetPasswordRequest({ identifier, code, password, confirmPassword });
      Alert.alert(t("passwordUpdated"), t("passwordUpdatedDescription"));
      navigation.navigate("Login");
    } catch (error) {
      Alert.alert(t("passwordUpdateFailed"), error instanceof Error ? error.message : t("tryAgain"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen style={styles.container}>
      <BrandHeader />
      <View style={styles.form}>
        <Text style={[styles.title, { color: theme.text }]}>{t("resetPasswordTitle")}</Text>
        <TextField label={t("emailOrPhone")} autoCapitalize="none" value={identifier} onChangeText={setIdentifier} />
        <TextField label={t("verificationCode")} keyboardType="number-pad" value={code} onChangeText={setCode} />
        <TextField label={t("newPassword")} secureTextEntry value={password} onChangeText={setPassword} />
        <Text style={[styles.passwordHint, { color: theme.muted }]}>{t("passwordPolicy")}</Text>
        <TextField label={t("passwordConfirmation")} secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />
        {confirmPassword && !passwordsMatch ? <Text style={styles.validationError}>{t("passwordConfirmationMismatch")}</Text> : null}
        <PrimaryButton title={t("updatePassword")} loading={loading} disabled={!identifier || !code || !passwordPolicy.valid || !passwordsMatch} onPress={handleReset} />
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
  passwordHint: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: -8
  },
  validationError: {
    color: "#dc2626",
    fontSize: 13,
    lineHeight: 18,
    marginTop: -8
  }
});
