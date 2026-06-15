import { Image, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/theme-provider";
import logo from "../../assets/images/logo.png";

export function BrandHeader() {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <Image accessibilityLabel="Logivya" alt="Logivya" source={logo} style={styles.logo} resizeMode="contain" />
      <Text style={[styles.slogan, { color: theme.muted }]}>
        Tüm İletişim Kanallarınızı ve İş Süreçlerinizi Tek Platformdan Yönetin
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 18,
    marginBottom: 32
  },
  logo: {
    width: 220,
    height: 96
  },
  slogan: {
    maxWidth: 320,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600"
  }
});
