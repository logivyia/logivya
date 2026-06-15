import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/theme-provider";

export function LoadingState({ label }: { label: string }) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <ActivityIndicator color={theme.primary} />
      <Text style={[styles.text, { color: theme.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 12,
    padding: 32
  },
  text: {
    fontSize: 15,
    fontWeight: "700"
  }
});
