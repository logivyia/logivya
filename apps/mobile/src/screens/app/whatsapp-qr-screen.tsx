import { useCallback, useEffect, useRef } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useWhatsAppStore } from "@/features/whatsapp/whatsappStore";
import { mapWhatsAppStatus } from "@/features/whatsapp/whatsappStatus";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { useTranslation } from "@/i18n/use-translation";
import { colors } from "@/theme/colors";
import { useTheme } from "@/theme/theme-provider";
import type { WhatsAppStackParamList } from "@/types/navigation";

type WhatsAppNavigation = NativeStackNavigationProp<WhatsAppStackParamList>;

function isExpired(value?: string | null) {
  return Boolean(value && new Date(value).getTime() <= Date.now());
}

export function WhatsAppQRScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<WhatsAppNavigation>();
  const { qr, generateQr, pollAccount, resetConnection } = useWhatsAppStore();
  const didStart = useRef(false);

  const startQr = useCallback(async () => {
    resetConnection("qr");
    await generateQr();
  }, [generateQr, resetConnection]);

  useEffect(() => {
    if (didStart.current) return;
    didStart.current = true;
    void startQr();
  }, [startQr]);

  useEffect(() => {
    const accountId = qr.account?.id;
    if (!accountId || ["connected", "failed"].includes(qr.phase)) return;

    const timer = setInterval(() => {
      if (isExpired(qr.account?.qrExpiresAt)) {
        void generateQr();
        return;
      }
      void pollAccount(accountId, "qr");
    }, 3000);

    return () => clearInterval(timer);
  }, [generateQr, pollAccount, qr.account?.id, qr.account?.qrExpiresAt, qr.phase]);

  useEffect(() => {
    if (qr.phase !== "connected") return;
    const timer = setTimeout(() => navigation.popToTop(), 1300);
    return () => clearTimeout(timer);
  }, [navigation, qr.phase]);

  const status = mapWhatsAppStatus(qr.account?.status);

  if (qr.phase === "generating" || qr.phase === "idle") {
    return (
      <Screen>
        <LoadingState label={t("qrGenerating")} />
      </Screen>
    );
  }

  if (qr.phase === "failed" && !qr.account?.qrCode) {
    return (
      <Screen>
        <Text style={{ color: theme.muted, textAlign: "center", marginBottom: 12 }}>{qr.error ?? t("actionFailed")}</Text>
        <ErrorState title={t("statusFailed")} onRetry={() => void startQr()} />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>{t("connectWithQr")}</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>{t("qrInstructions")}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {qr.phase === "connected" ? (
            <View style={styles.successBox}>
              <View style={styles.successIcon}>
                <Text style={styles.successMark}>✓</Text>
              </View>
              <Text style={[styles.successTitle, { color: theme.text }]}>{t("connectionSuccess")}</Text>
              <Text style={[styles.subtitle, { color: theme.muted }]}>{t("returningToAccounts")}</Text>
            </View>
          ) : qr.account?.qrCode ? (
            <Image source={{ uri: qr.account.qrCode }} style={styles.qrImage} resizeMode="contain" accessibilityLabel={t("connectWithQr")} alt={t("connectWithQr")} />
          ) : (
            <LoadingState label={t("qrGenerating")} />
          )}

          {qr.phase !== "connected" ? (
            <>
              <View style={[styles.statusPill, { backgroundColor: `${colors.orange}18` }]}>
                <Text style={[styles.statusText, { color: colors.orange }]}>{t(status.labelKey)}</Text>
              </View>
              <Text style={[styles.helperText, { color: theme.muted }]}>
                {isExpired(qr.account?.qrExpiresAt) ? t("qrExpired") : t("qrWaiting")}
              </Text>
              {qr.error ? <Text style={[styles.errorText, { color: colors.danger }]}>{qr.error}</Text> : null}
            </>
          ) : null}
        </View>

        {qr.phase !== "connected" ? <PrimaryButton title={t("refreshQr")} onPress={() => void startQr()} /> : null}

        <Pressable accessibilityRole="button" onPress={() => navigation.popToTop()} style={styles.linkButton}>
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
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 28,
    gap: 16,
    padding: 22
  },
  qrImage: {
    width: 280,
    height: 280,
    borderRadius: 18,
    backgroundColor: colors.white
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
  helperText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    fontWeight: "700"
  },
  errorText: {
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center"
  },
  successBox: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 28
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
  }
});
