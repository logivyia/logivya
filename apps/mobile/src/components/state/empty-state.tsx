import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/theme-provider";

export function EmptyState({ title, description }: { title: string; description?: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {description ? <Text style={[styles.description, { color: theme.muted }]}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    gap: 8
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center"
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center"
  }
});
