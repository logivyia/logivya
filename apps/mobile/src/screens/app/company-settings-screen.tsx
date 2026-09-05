import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { getMobileCompanyProfile, updateMobileCompanyProfile, type MobileCompanyProfile } from "@/api/mobileCompany";
import { useAuthStore } from "@/auth/auth-store";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { PageHeader, SurfaceCard } from "@/components/ui";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

type CompanyForm = Pick<MobileCompanyProfile, "name" | "email" | "phone">;
type FormKey = keyof CompanyForm;

const emptyForm: CompanyForm = {
  name: "",
  email: "",
  phone: "",
};

function toForm(company: MobileCompanyProfile): CompanyForm {
  return {
    name: company.name || "",
    email: company.email || "",
    phone: company.phone || "",
  };
}

function normalizeForm(form: CompanyForm): CompanyForm {
  return Object.fromEntries(Object.entries(form).map(([key, value]) => [key, String(value ?? "").trim()])) as CompanyForm;
}

export function CompanySettingsScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const loadFailedText = t("companyProfileLoadFailed");
  const setCompany = useAuthStore((state) => state.setCompany);
  const canEdit = useAuthStore((state) => state.permissions.includes("manage_company_settings"));
  const fallbackCompany = useAuthStore((state) => state.company);
  const [form, setForm] = useState<CompanyForm>(() => ({ ...emptyForm, name: fallbackCompany?.name || "" }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const phoneInputRef = useRef<TextInput>(null);

  const fields = useMemo(
    () =>
      [
        { key: "name", label: t("companyName"), placeholder: t("companyNamePlaceholder"), required: true },
        { key: "email", label: t("email"), placeholder: t("companyEmailPlaceholder"), keyboardType: "email-address", autoCapitalize: "none", editable: false },
        { key: "phone", label: t("phone"), placeholder: t("companyPhonePlaceholder"), keyboardType: "phone-pad" },
      ] satisfies Array<{
        key: FormKey;
        label: string;
        placeholder: string;
        required?: boolean;
        keyboardType?: "default" | "email-address" | "phone-pad";
        autoCapitalize?: "none" | "sentences" | "words" | "characters";
        editable?: boolean;
      }>,
    [t],
  );

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getMobileCompanyProfile()
      .then(({ company }) => {
        if (!mounted) return;
        setForm(toForm(company));
        setCompany(company);
        setMessage(null);
      })
      .catch(() => {
        if (mounted) setMessage({ type: "error", text: loadFailedText });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [loadFailedText, setCompany]);

  const updateField = (key: FormKey, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (message) setMessage(null);
  };

  const save = async () => {
    const normalized = normalizeForm(form);
    if (!normalized.name) {
      setMessage({ type: "error", text: t("requiredField") });
      return;
    }
    setSaving(true);
    try {
      const { company } = await updateMobileCompanyProfile({ name: normalized.name, phone: normalized.phone });
      setForm(toForm(company));
      setCompany(company);
      setMessage({ type: "success", text: t("savedSuccessfully") });
    } catch {
      setMessage({ type: "error", text: t("saveFailed") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <ScrollView
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          contentContainerStyle={styles.content}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <PageHeader eyebrow={t("accountSection")} title={t("companySettings")} description={t("companySettingsDescription")} />

          <SurfaceCard style={styles.card}>
            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={theme.primary} />
                <Text style={[styles.loadingText, { color: theme.muted }]}>{t("loadingCompanyProfile")}</Text>
              </View>
            ) : (
              <>
                {message ? (
                  <View
                    style={[
                      styles.banner,
                      {
                        backgroundColor: message.type === "success" ? theme.successSoft : theme.dangerSoft,
                        borderColor: message.type === "success" ? theme.success : theme.danger,
                      },
                    ]}
                  >
                    <Text style={[styles.bannerText, { color: message.type === "success" ? theme.success : theme.danger }]}>{message.text}</Text>
                  </View>
                ) : null}

                <View style={styles.formGrid}>
                  {fields.map((field) => {
                    const isName = field.key === "name";
                    const isPhone = field.key === "phone";
                    return (
                      <TextField
                        key={field.key}
                        ref={isPhone ? phoneInputRef : undefined}
                        label={field.required ? `${field.label} *` : field.label}
                        value={form[field.key] || ""}
                        editable={canEdit && field.editable !== false}
                        placeholder={field.placeholder}
                        keyboardType={field.keyboardType}
                        autoCapitalize={field.autoCapitalize}
                        blurOnSubmit={!isName}
                        returnKeyType={isName ? "next" : isPhone ? "done" : undefined}
                        onSubmitEditing={isName ? () => phoneInputRef.current?.focus() : isPhone ? Keyboard.dismiss : undefined}
                        onChangeText={(value) => updateField(field.key, value)}
                      />
                    );
                  })}
                </View>

                {canEdit ? (
                  <PrimaryButton title={saving ? t("saving") : t("save")} icon="save-outline" loading={saving} disabled={saving} onPress={() => { Keyboard.dismiss(); void save(); }} />
                ) : null}
              </>
            )}
          </SurfaceCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  keyboard: { flex: 1 },
  content: { gap: 14, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 16 },
  loading: { alignItems: "center", gap: 12, paddingVertical: 28 },
  loadingText: { fontSize: 14, fontWeight: "700" },
  banner: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  bannerText: { fontSize: 14, fontWeight: "800", lineHeight: 20 },
  formGrid: { gap: 14 },
});
