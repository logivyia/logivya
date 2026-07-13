import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

import { useTheme } from "@/theme/theme-provider";

type Props = {
  title: string;
  icon?: ComponentProps<typeof Ionicons>["name"];
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function PrimaryButton({ title, icon, loading = false, disabled = false, onPress }: Props) {
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
      {loading ? (
        <ActivityIndicator color={theme.primaryText} />
      ) : (
        <View style={styles.content}>
          {icon ? <Ionicons name={icon} color={isDisabled ? theme.muted : theme.primaryText} size={19} /> : null}
          <Text style={[styles.text, { color: isDisabled ? theme.muted : theme.primaryText }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18
  },
  content: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center"
  },
  text: {
    fontSize: 16,
    fontWeight: "800"
  }
});
