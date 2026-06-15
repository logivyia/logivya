import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { BrandHeader } from "@/components/brand-header";
import { Screen } from "@/components/screen";
import { useTheme } from "@/theme/theme-provider";

export function SplashScreen() {
  const theme = useTheme();

  return (
    <Screen style={styles.container}>
      <BrandHeader />
      <View style={styles.loading}>
        <ActivityIndicator color={theme.primary} />
        <Text style={[styles.text, { color: theme.muted }]}>Logivya hazırlanıyor...</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center"
  },
  loading: {
    alignItems: "center",
    gap: 12
  },
  text: {
    fontSize: 14,
    fontWeight: "600"
  }
});
