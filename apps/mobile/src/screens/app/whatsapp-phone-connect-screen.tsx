import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { normalizeTurkishPhone } from "@/features/whatsapp/phone";
import { useWhatsAppStore } from "@/features/whatsapp/whatsappStore";
import { mapWhatsAppStatus } from "@/features/whatsapp/whatsappStatus";
import { ErrorState } from "@/components/state/error-state";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { useTranslation } from "@/i18n/use-translation";
import { colors } from "@/theme/colors";
import { useTheme } from "@/theme/theme-provider";
import type { WhatsAppStackParamList } from "@/types/navigation";

type WhatsAppNavigation = NativeStackNavigationProp<WhatsAppStackParamList>;

function isExpired(value?: string | null) {
  return Boolean(value && new Date(value).getTime() <= Date.now());
}

export function WhatsAppPhoneConnectScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<WhatsAppNavigation>();
  const { phoneCode, generatePhoneCode, pollAccount, resetConnection } = useWhatsAppStore();
  const [phoneInput, setPhoneInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const status = mapWhatsAppStatus(phoneCode.account?.status);
  const pairingCode = phoneCode.account?.pairingCode;

  const submit = async () => {
    try {
      const normalized = normalizeTurkishPhone(phoneInput);
      setFormError(null);
      await generatePhoneCode(normalized);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("actionFailed"));
    }
  };

  useEffect(() => {
    const accountId = phoneCode.account?.id;
    if (!accountId || ["connected", "failed", "expired"].includes(phoneCode.phase)) return;

    const timer = setInterval(() => {
      if (isExpired(phoneCode.account?.pairingCodeExpiresAt)) {
        useWhatsAppStore.setState((state) => ({
          phoneCode: { ...state.phoneCode, phase: "expired", polling: false, error: t("qrExpired") }
        }));
        return;
      }
      void pollAccount(accountId, "phoneCode");
    }, 3000);

    return () => clearInterval(timer);
  }, [phoneCode.account?.id, phoneCode.account?.pairingCodeExpiresAt, phoneCode.phase, pollAccount, t]);

  useEffect(() => {
    if (phoneCode.phase !== "connected") return;
    const timer = setTimeout(() => navigation.popToTop(), 1300);
    return () => clearTimeout(timer);
  }, [navigation, phoneCode.phase]);

  const showCode = Boolean(pairingCode && !["connected", "failed", "expired"].includes(phoneCode.phase));

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>{t("connectWithPhoneCode")}</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>{t("phoneCodeInstructions")}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.label, { color: theme.text }]}>{t("country")}</Text>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.countrySelector,
              { borderColor: theme.border, backgroundColor: theme.background, opacity: pressed ? 0.8 : 1 }
            ]}
          >
            <Text style={[styles.countryText, { color: theme.text }]}>{t("countryTurkey")} (+90)</Text>
          </Pressable>

          <TextField label={t("phoneNumber")} value={phoneInput} onChangeText={setPhoneInput} placeholder={t("phonePlaceholder")} keyboardType="phone-pad" />

          {phoneCode.normalizedPhone ? (
            <Text style={[styles.normalized, { color: theme.muted }]}>
              {t("normalizedPhone")}: {phoneCode.normalizedPhone}
            </Text>
          ) : null}

          {formError ? <Text style={[styles.errorText, { color: colors.danger }]}>{formError}</Text> : null}
          {phoneCode.error ? <Text style={[styles.errorText, { color: colors.danger }]}>{phoneCode.error}</Text> : null}

          <PrimaryButton
            title={pairingCode ? t("newCode") : t("generatePhoneCode")}
            loading={phoneCode.phase === "generating"}
            disabled={!phoneInput.trim()}
            onPress={() => void submit()}
          />
        </View>

        {showCode ? (
          <View style={[styles.codeCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.label, { color: theme.text }]}>{t("pairingCode")}</Text>
            <Text style={[styles.code, { color: theme.primary }]}>{pairingCode}</Text>
            <View style={[styles.statusPill, { backgroundColor: `${colors.orange}18` }]}>
              <Text style={[styles.statusText, { color: colors.orange }]}>{t(status.labelKey)}</Text>
            </View>
            <Text style={[styles.subtitle, { color: theme.muted }]}>{t("pollingConnection")}</Text>
          </View>
        ) : null}

        {phoneCode.phase === "connected" ? (
          <View style={[styles.codeCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.successIcon}>
              <Text style={styles.successMark}>✓</Text>
            </View>
            <Text style={[styles.successTitle, { color: theme.text }]}>{t("connectionSuccess")}</Text>
            <Text style={[styles.subtitle, { color: theme.muted }]}>{t("returningToAccounts")}</Text>
          </View>
        ) : null}

        {phoneCode.phase === "expired" ? (
          <View style={styles.expiredBox}>
            <Text style={[styles.errorText, { color: colors.danger, textAlign: "center" }]}>{t("qrExpired")}</Text>
            <ErrorState title={t("statusFailed")} onRetry={() => void submit()} />
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            resetConnection("phoneCode");
            navigation.popToTop();
          }}
          style={styles.linkButton}
        >
          <Text style={[styles.linkText, { color: theme.primary }]}>{t("whatsappAccounts")}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18
  },
  content: {
    gap: 18,
    paddingBottom: 32
  },
  header: {
    gap: 8
  },
  title: {
    fontSize: 30,
    fontWeight: "900"
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    textAlign: "center"
  },
  card: {
    borderWidth: 1,
    borderRadius: 28,
    gap: 14,
    padding: 18
  },
  codeCard: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 28,
    gap: 14,
    padding: 22
  },
  label: {
    fontSize: 14,
    fontWeight: "900"
  },
  countrySelector: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 16,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  countryText: {
    fontSize: 16,
    fontWeight: "800"
  },
  normalized: {
    fontSize: 13,
    fontWeight: "700"
  },
  errorText: {
    fontSize: 13,
    fontWeight: "800"
  },
  code: {
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: 7
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  statusText: {
    fontSize: 13,
    fontWeight: "900"
  },
  successIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${colors.success}22`
  },
  successMark: {
    color: colors.success,
    fontSize: 46,
    fontWeight: "900"
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "900"
  },
  linkButton: {
    alignItems: "center",
    paddingVertical: 8
  },
  linkText: {
    fontSize: 15,
    fontWeight: "900"
  },
  expiredBox: {
    gap: 10
  }
});
