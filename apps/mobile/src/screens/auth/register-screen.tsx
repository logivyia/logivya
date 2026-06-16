import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { register } from "@/auth/auth-service";
import { BrandHeader } from "@/components/brand-header";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { AuthStackParamList } from "@/types/navigation";

export function RegisterScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const theme = useTheme();
  const { t } = useTranslation();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    setLoading(true);
    try {
      await register({
        fullName,
        email,
        phone,
        companyName,
        password,
        passwordConfirmation,
        acceptTerms: true,
        acceptPrivacy: true,
        acceptKvkk: true
      });
    } catch (error) {
      Alert.alert("Kayıt tamamlanamadı", error instanceof Error ? error.message : "Bilgilerinizi kontrol edin.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <BrandHeader />
        <View style={styles.form}>
          <Text style={[styles.title, { color: theme.text }]}>{t("registerTitle")}</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>Güvenli Logivya çalışma alanınızı oluşturun.</Text>
          <TextField label="Ad soyad" value={fullName} onChangeText={setFullName} />
          <TextField label="E-posta" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <TextField label="Telefon" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          <TextField label="Şirket adı" value={companyName} onChangeText={setCompanyName} />
          <TextField label="Parola" secureTextEntry value={password} onChangeText={setPassword} />
          <TextField label="Parola tekrar" secureTextEntry value={passwordConfirmation} onChangeText={setPasswordConfirmation} />
          <PrimaryButton title={t("register")} loading={loading} disabled={!fullName || !email || !password || password !== passwordConfirmation} onPress={handleRegister} />
          <Pressable onPress={() => navigation.navigate("Login")} style={styles.centerLink}>
            <Text style={{ color: theme.muted }}>Zaten hesabınız var mı? <Text style={{ color: theme.primary }}>Giriş yap</Text></Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  subtitle: {
    fontSize: 16,
    marginBottom: 8
  },
  centerLink: {
    alignItems: "center",
    paddingTop: 8
  }
});
