import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";

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

  async function handleReset() {
    setLoading(true);
    try {
      await resetPasswordRequest({ identifier, code, password, confirmPassword });
      Alert.alert("Parola güncellendi", "Yeni parolanızla giriş yapabilirsiniz.");
      navigation.navigate("Login");
    } catch (error) {
      Alert.alert("Parola güncellenemedi", error instanceof Error ? error.message : "Lütfen tekrar deneyin.");
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
        <TextField label="Doğrulama kodu" keyboardType="number-pad" value={code} onChangeText={setCode} />
        <TextField label="Yeni parola" secureTextEntry value={password} onChangeText={setPassword} />
        <TextField label="Yeni parola tekrarı" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />
        <PrimaryButton title="Parolayı güncelle" loading={loading} disabled={!identifier || !code || !password || !confirmPassword} onPress={handleReset} />
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
  }
});
