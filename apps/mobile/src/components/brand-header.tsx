import { Image, StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme/colors";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import logo from "../../assets/images/logo.png";

export function BrandHeader() {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={[styles.logoFrame, theme.mode === "light" ? styles.logoFrameLight : null]}>
        <Image accessibilityLabel="Logivya" alt="Logivya" source={logo} style={styles.logo} resizeMode="contain" resizeMethod="resize" />
      </View>
      <Text style={[styles.slogan, { color: theme.muted }]}>{t("appTagline")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 18,
    marginBottom: 32
  },
  logoFrame: {
    alignItems: "center",
    borderRadius: 24,
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  logoFrameLight: {
    backgroundColor: colors.navy
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
