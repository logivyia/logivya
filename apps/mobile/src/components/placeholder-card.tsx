import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/theme-provider";

type Props = {
  title: string;
  description: string;
};

export function PlaceholderCard({ title, description }: Props) {
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.description, { color: theme.muted }]}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    gap: 10
  },
  title: {
    fontSize: 26,
    fontWeight: "800"
  },
  description: {
    fontSize: 16,
    lineHeight: 24
  }
});
