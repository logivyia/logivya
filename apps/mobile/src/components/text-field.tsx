import { StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";

import { useTheme } from "@/theme/theme-provider";

type Props = TextInputProps & {
  label: string;
};

export function TextField({ label, ...props }: Props) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.muted}
        style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8
  },
  label: {
    fontSize: 14,
    fontWeight: "700"
  },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16
  }
});
