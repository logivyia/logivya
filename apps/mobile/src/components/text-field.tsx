import { Ionicons } from "@expo/vector-icons";
import { forwardRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";

import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

type Props = TextInputProps & {
  label: string;
};

export const TextField = forwardRef<TextInput, Props>(function TextField({ label, secureTextEntry = false, style, ...props }, ref) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const passwordToggleLabel = passwordVisible ? t("hidePassword") : t("showPassword");

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          ref={ref}
          placeholderTextColor={theme.muted}
          secureTextEntry={secureTextEntry && !passwordVisible}
          style={[
            styles.input,
            secureTextEntry ? styles.secureInput : null,
            { color: theme.text, backgroundColor: theme.input, borderColor: theme.border },
            style,
          ]}
          {...props}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityLabel={passwordToggleLabel}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setPasswordVisible((visible) => !visible)}
            style={styles.passwordToggle}
          >
            <Ionicons
              color={theme.muted}
              name={passwordVisible ? "eye-off-outline" : "eye-outline"}
              size={22}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 8
  },
  label: {
    fontSize: 13,
    fontWeight: "800"
  },
  inputWrap: {
    position: "relative"
  },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16
  },
  secureInput: {
    paddingRight: 54
  },
  passwordToggle: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    minHeight: 54,
    position: "absolute",
    right: 8,
    top: 0,
    width: 44
  }
});
