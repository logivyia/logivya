import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { login } from "@/auth/auth-service";
import { BrandHeader } from "@/components/brand-header";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { AuthStackParamList } from "@/types/navigation";

export function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const theme = useTheme();
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    try {
      await login(identifier, password);
    } catch (error) {
      Alert.alert("Giriş yapılamadı", error instanceof Error ? error.message : "Bilgilerinizi kontrol edin.");
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
        <TextField label={t("emailOrPhone")} autoCapitalize="none" value={identifier} onChangeText={setIdentifier} />
        <TextField label={t("password")} secureTextEntry value={password} onChangeText={setPassword} />
        <Pressable onPress={() => navigation.navigate("ForgotPassword")} style={styles.linkWrap}>
          <Text style={[styles.link, { color: theme.primary }]}>{t("forgotPassword")}</Text>
        </Pressable>
        <PrimaryButton title={t("login")} loading={loading} disabled={!identifier || !password} onPress={handleLogin} />
        <Pressable onPress={() => navigation.navigate("Register")} style={styles.centerLink}>
          <Text style={{ color: theme.muted }}>{"Logivya'da yeni misiniz? "}<Text style={{ color: theme.primary }}>Hesap oluştur</Text></Text>
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
  }
});
