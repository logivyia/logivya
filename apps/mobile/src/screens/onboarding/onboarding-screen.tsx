import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSettingsStore } from "@/auth/settings-store";
import { PrimaryButton } from "@/components/primary-button";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import logo from "../../../assets/images/logo.png";

export function OnboardingScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const completeOnboarding = useSettingsStore((state) => state.completeOnboarding);
  const [index, setIndex] = useState(0);
  const slides = useMemo(
    () => [
      {
        icon: "logo-whatsapp" as const,
        title: t("whatsappAccounts"),
        description: t("whatsappScreenSubtitle"),
        points: [t("refreshGroups"), t("refreshContacts")],
      },
      {
        icon: "albums-outline" as const,
        title: t("categoriesTitle"),
        description: t("categoriesSubtitle"),
        points: [t("filterByAccount"), t("filterByCategory")],
      },
      {
        icon: "options-outline" as const,
        title: t("onboardingControlTitle"),
        description: t("onboardingControlDescription"),
        points: [t("notificationPreferences"), t("security"), t("feedback")],
      },
    ],
    [t],
  );
  const slide = slides[index] ?? slides[0]!;
  const isLast = index === slides.length - 1;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Image accessibilityLabel="Logivya" source={logo} resizeMode="contain" resizeMethod="resize" style={styles.logo} />
          <Pressable accessibilityRole="button" onPress={completeOnboarding} hitSlop={12}>
            <Text style={[styles.skip, { color: theme.muted }]}>{t("onboardingSkip")}</Text>
          </Pressable>
        </View>

        <View style={styles.intro}>
          <Text style={[styles.eyebrow, { color: theme.primary }]}>{t("onboardingEyebrow")}</Text>
          <Text style={[styles.title, { color: theme.text }]}>{t("onboardingTitle")}</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>{t("onboardingSubtitle")}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow }]}>
          <View style={[styles.icon, { backgroundColor: theme.badge }]}>
            <Ionicons name={slide.icon} size={34} color={theme.primary} />
          </View>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{slide.title}</Text>
          <Text style={[styles.cardDescription, { color: theme.muted }]}>{slide.description}</Text>
          <View style={styles.points}>
            {slide.points.map((point) => (
              <View key={point} style={styles.pointRow}>
                <Ionicons name="checkmark-circle" size={20} color={theme.success} />
                <Text style={[styles.pointText, { color: theme.text }]}>{point}</Text>
              </View>
            ))}
          </View>
        </View>

        <View accessibilityLabel={`${index + 1}/${slides.length}`} style={styles.dots}>
          {slides.map((item, slideIndex) => (
            <View
              key={item.title}
              style={[
                styles.dot,
                { backgroundColor: slideIndex === index ? theme.primary : theme.border },
                slideIndex === index ? styles.dotActive : null,
              ]}
            />
          ))}
        </View>

        <PrimaryButton
          icon={isLast ? "arrow-forward-circle-outline" : "arrow-forward-outline"}
          title={isLast ? t("onboardingStart") : t("continue")}
          onPress={() => {
            if (isLast) completeOnboarding();
            else setIndex((current) => Math.min(current + 1, slides.length - 1));
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flexGrow: 1, gap: 24, justifyContent: "space-between", padding: 22 },
  topRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  logo: { height: 62, width: 170 },
  skip: { fontSize: 14, fontWeight: "800" },
  intro: { gap: 8 },
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 2, textTransform: "uppercase" },
  title: { fontSize: 32, fontWeight: "900", lineHeight: 38 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  card: { borderRadius: 26, borderWidth: 1, elevation: 3, gap: 14, padding: 22, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.1, shadowRadius: 24 },
  icon: { alignItems: "center", borderRadius: 20, height: 64, justifyContent: "center", width: 64 },
  cardTitle: { fontSize: 24, fontWeight: "900" },
  cardDescription: { fontSize: 15, lineHeight: 22 },
  points: { gap: 12, paddingTop: 4 },
  pointRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  pointText: { flex: 1, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  dots: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "center" },
  dot: { borderRadius: 999, height: 8, width: 8 },
  dotActive: { width: 28 },
});
