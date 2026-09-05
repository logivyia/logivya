import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { MobilePlanCatalogItem } from "@/api/mobileSubscription";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

export function MobilePlanBenefits({
  plan,
  fallbackDescription,
}: {
  plan: MobilePlanCatalogItem | undefined;
  fallbackDescription: string;
}) {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const featureCodes = Array.isArray(plan?.featureCodes)
    ? plan.featureCodes
    : [];
  const localizedMarketingFeatures = locale === "ar"
    ? plan ? featureCodes.map((code) => featureLabel(plan, code, t)) : []
    : plan?.marketingFeatures?.[locale === "tr" ? "tr" : "en"] ?? [];
  const localizedSummaryGroups = locale === "ar" && plan
    ? arabicSummaryTitles(plan.code).map((title) => ({ title, description: "" }))
    : plan?.marketingSummaryGroups?.[locale === "tr" ? "tr" : "en"] ?? [];
  const visibleFeatures = localizedMarketingFeatures.length
    ? localizedMarketingFeatures
    : plan
      ? featureCodes.map((code) => featureLabel(plan, code, t))
      : [];

  const description =
    (locale === "ar" ? "" : plan?.marketingDescription?.[locale === "tr" ? "tr" : "en"]) ||
    (plan?.code === "PROFESSIONAL"
      ? t("planProfessionalDescription")
      : plan?.code === "STARTER"
        ? t("planStarterDescription")
        : fallbackDescription);

  return (
    <View style={styles.container}>
      <Text style={[styles.description, { color: theme.muted }]}>
        {description}
      </Text>
      {plan && localizedSummaryGroups.length ? (
        <View
          style={styles.featureList}
          accessibilityRole="list"
          accessibilityLabel={t("planFeaturesLabel")}
        >
          {localizedSummaryGroups.map((group) => (
            <View
              key={group.title}
              style={styles.featureRow}
              accessibilityRole="text"
            >
              <Ionicons
                name="checkmark"
                size={18}
                color={theme.success}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              <Text style={[styles.summaryTitle, styles.flexText, { color: theme.text }]}>{group.title}</Text>
            </View>
          ))}
        </View>
      ) : plan && visibleFeatures.length ? (
        <View style={styles.featureList} accessibilityRole="list" accessibilityLabel={t("planFeaturesLabel")}>
          {visibleFeatures.map((feature) => (
            <View key={feature} style={styles.featureRow} accessibilityRole="text">
              <Ionicons name="checkmark" size={18} color={theme.success} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
              <Text style={[styles.featureText, { color: theme.text }]}>{feature}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function MobilePlanSeatInfo({ plan }: { plan: MobilePlanCatalogItem | undefined }) {
  const theme = useTheme();
  const { locale } = useTranslation();
  if (!plan) return null;
  const count = plan.limits?.accounts ?? 0;
  return (
    <View style={styles.seatBlock}>
      <Text style={[styles.seatCount, { color: theme.primary }]}>
        {count} {locale === "tr" ? "kullanıcı" : locale === "ar" ? "مستخدمون" : count === 1 ? "user" : "users"}
      </Text>
    </View>
  );
}

export function MobilePlanDetailsDisclosure({ plan }: { plan: MobilePlanCatalogItem | undefined }) {
  const theme = useTheme();
  const { locale, t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const features = locale === "ar" && plan
    ? plan.featureCodes.map((code) => featureLabel(plan, code, t))
    : plan?.marketingFeatures?.[locale === "tr" ? "tr" : "en"] ?? [];
  const showSeatDetails = Boolean(plan && plan.slug !== "trial");
  const seatCount = plan?.limits?.accounts ?? 0;
  const detailItems = [
    ...features,
    ...(showSeatDetails
      ? [`${seatCount} ${locale === "tr" ? "kullanıcı" : locale === "ar" ? "مستخدمون" : seatCount === 1 ? "user" : "users"}`]
      : []),
  ];
  if (!detailItems.length) return null;
  return (
    <View style={styles.disclosureContainer}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [
          styles.disclosureButton,
          { borderColor: theme.border, backgroundColor: theme.cardMuted, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <Text style={[styles.disclosureLabel, { color: theme.primary }]}>
          {expanded
            ? locale === "tr" ? "Özellikleri gizle" : locale === "ar" ? "إخفاء الميزات" : "Hide features"
            : locale === "tr" ? "Tüm özellikleri gör" : locale === "ar" ? "عرض جميع الميزات" : "View all features"}
        </Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={theme.primary} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
      </Pressable>
      {expanded ? (
        <View style={styles.detailList} accessibilityRole="list" accessibilityLabel={t("planFeaturesLabel")}>
          {detailItems.map((feature) => (
            <View key={feature} style={styles.featureRow} accessibilityRole="text">
              <Ionicons name="checkmark" size={18} color={theme.success} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
              <Text style={[styles.featureText, { color: theme.text }]}>{feature}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function featureLabel(
  plan: MobilePlanCatalogItem,
  code: MobilePlanCatalogItem["featureCodes"][number],
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (code === "ACCOUNT_ALLOWANCE") {
    return t("planFeatureAccounts", { count: plan.limits?.accounts ?? 0 });
  }
  if (code === "BRANDED_MESSAGING") return t("planFeatureBranded");
  if (code === "UNBRANDED_MESSAGING") return t("planFeatureUnbranded");
  if (code === "CONTACT_MESSAGING") return t("planFeatureContacts");
  if (code === "GROUP_MESSAGING") return t("planFeatureGroups");
  if (code === "SCHEDULED_RECURRING") {
    return t("planFeatureScheduledRecurring");
  }
  if (code === "DELETE_FOR_EVERYONE") {
    return t("planFeatureDeleteEveryone");
  }
  if (code === "ADVANCED_SUPPORT") return t("planFeatureAdvancedSupport");
  return t("planFeatureTrialDays", { count: plan.trialDays });
}

function arabicSummaryTitles(code: MobilePlanCatalogItem["code"]) {
  if (code === "TRIAL") return ["السوق اللوجستي المباشر", "أدوات الشحنات والمركبات والسائقين", "الخدمات اللوجستية العامة والمتخصصة", "إدارة الإعلانات والطلبات", "المطابقة الذكية", "إدارة WhatsApp وTelegram", "أدوات المراسلة"];
  if (code === "STARTER") return ["السوق اللوجستي المباشر", "أدوات الشحنات والمركبات والسائقين", "الخدمات اللوجستية العامة والمتخصصة", "الإعلانات والمطابقة الذكية", "إدارة WhatsApp وTelegram", "مراسلة جهات الاتصال والمجموعات", "مزايا الخطة"];
  return ["السوق اللوجستي المباشر", "أدوات الشحنات والمركبات والسائقين", "الخدمات اللوجستية العامة والمتخصصة", "المطابقة الذكية المتقدمة", "إدارة WhatsApp وTelegram", "أتمتة المجموعات والفئات والرسائل", "السجل ومزايا الخطة"];
}

const styles = StyleSheet.create({
  container: { gap: 13 },
  description: { fontSize: 14, lineHeight: 21 },
  featureList: { gap: 9 },
  flexText: { flex: 1 },
  featureRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 9,
  },
  featureText: { flex: 1, fontSize: 14, lineHeight: 20 },
  summaryTitle: { fontSize: 14, fontWeight: "700", lineHeight: 20 },
  seatBlock: { gap: 3, marginTop: 5 },
  seatCount: { fontSize: 14, fontWeight: "700", lineHeight: 20 },
  disclosureContainer: { gap: 12 },
  disclosureButton: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 14,
  },
  disclosureLabel: { fontSize: 14, fontWeight: "700", marginRight: 7 },
  detailList: { gap: 9 },
});
