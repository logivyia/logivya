import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { useTheme } from "@/theme/theme-provider";

type Props = {
  title: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function PrimaryButton({ title, loading = false, disabled = false, onPress }: Props) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: isDisabled ? theme.border : theme.primary, opacity: pressed ? 0.85 : 1 }
      ]}
    >
      {loading ? <ActivityIndicator color={theme.primaryText} /> : <Text style={[styles.text, { color: isDisabled ? theme.muted : theme.primaryText }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center"
  },
  text: {
    fontSize: 17,
    fontWeight: "700"
  }
});
