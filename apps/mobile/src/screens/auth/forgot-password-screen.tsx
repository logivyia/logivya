import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { forgotPasswordRequest } from "@/api/auth-api";
import { BrandHeader } from "@/components/brand-header";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { AuthStackParamList } from "@/types/navigation";

export function ForgotPasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const theme = useTheme();
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    try {
      await forgotPasswordRequest(identifier);
      Alert.alert("Kod gönderildi", "Eğer bilgiler sistemde kayıtlıysa doğrulama kodu gönderilmiştir.");
      navigation.navigate("ResetPassword", { identifier });
    } catch (error) {
      Alert.alert("Kod gönderilemedi", error instanceof Error ? error.message : "Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen style={styles.container}>
      <BrandHeader />
      <View style={styles.form}>
        <Text style={[styles.title, { color: theme.text }]}>{t("forgotPasswordTitle")}</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>E-posta veya telefon bilginizi girin.</Text>
        <TextField label={t("emailOrPhone")} autoCapitalize="none" value={identifier} onChangeText={setIdentifier} />
        <PrimaryButton title="Doğrulama kodu gönder" loading={loading} disabled={!identifier} onPress={handleSubmit} />
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
    fontSize: 16
  }
});
