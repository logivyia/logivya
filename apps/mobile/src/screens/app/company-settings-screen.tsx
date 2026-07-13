import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { getMobileCompanyProfile, updateMobileCompanyProfile, type MobileCompanyProfile } from "@/api/mobileCompany";
import { useAuthStore } from "@/auth/auth-store";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { PageHeader, SurfaceCard } from "@/components/ui";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

type CompanyForm = Omit<MobileCompanyProfile, "id">;
type FormKey = keyof CompanyForm;

const emptyForm: CompanyForm = {
  name: "",
  email: "",
  phone: "",
  address: "",
  taxOffice: "",
  taxNumber: "",
  city: "",
  district: "",
  country: "TR",
  postalCode: "",
};

function toForm(company: MobileCompanyProfile): CompanyForm {
  return {
    name: company.name || "",
    email: company.email || "",
    phone: company.phone || "",
    address: company.address || "",
    taxOffice: company.taxOffice || "",
    taxNumber: company.taxNumber || "",
    city: company.city || "",
    district: company.district || "",
    country: company.country || "TR",
    postalCode: company.postalCode || "",
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
  const fallbackCompany = useAuthStore((state) => state.company);
  const [form, setForm] = useState<CompanyForm>(() => ({ ...emptyForm, name: fallbackCompany?.name || "" }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fields = useMemo(
    () =>
      [
        { key: "name", label: t("companyName"), placeholder: t("companyNamePlaceholder"), required: true },
        { key: "email", label: t("email"), placeholder: t("companyEmailPlaceholder"), keyboardType: "email-address", autoCapitalize: "none" },
        { key: "phone", label: t("phone"), placeholder: t("companyPhonePlaceholder"), keyboardType: "phone-pad" },
        { key: "address", label: t("address"), placeholder: t("companyAddressPlaceholder"), multiline: true },
        { key: "taxOffice", label: t("taxOffice"), placeholder: t("taxOfficePlaceholder") },
        { key: "taxNumber", label: t("taxNumber"), placeholder: t("taxNumberPlaceholder") },
        { key: "city", label: t("city"), placeholder: t("cityPlaceholder") },
        { key: "district", label: t("district"), placeholder: t("districtPlaceholder") },
        { key: "country", label: t("country"), placeholder: t("countryPlaceholder"), autoCapitalize: "characters" },
        { key: "postalCode", label: t("postalCode"), placeholder: t("postalCodePlaceholder") },
      ] satisfies Array<{
        key: FormKey;
        label: string;
        placeholder: string;
        required?: boolean;
        keyboardType?: "default" | "email-address" | "phone-pad";
        autoCapitalize?: "none" | "sentences" | "words" | "characters";
        multiline?: boolean;
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
    if (normalized.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
      setMessage({ type: "error", text: t("invalidEmail") });
      return;
    }

    setSaving(true);
    try {
      const { company } = await updateMobileCompanyProfile(normalized);
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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <PageHeader eyebrow={t("company")} title={t("companySettings")} description={t("companySettingsDescription")} />

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
                  {fields.map((field) => (
                    <TextField
                      key={field.key}
                      label={field.required ? `${field.label} *` : field.label}
                      value={form[field.key] || ""}
                      placeholder={field.placeholder}
                      keyboardType={field.keyboardType}
                      autoCapitalize={field.autoCapitalize}
                      multiline={field.multiline}
                      numberOfLines={field.multiline ? 4 : 1}
                      returnKeyType="next"
                      style={field.multiline ? styles.multilineInput : undefined}
                      onChangeText={(value) => updateField(field.key, value)}
                    />
                  ))}
                </View>

                <PrimaryButton title={saving ? t("saving") : t("save")} icon="save-outline" loading={saving} disabled={saving} onPress={save} />
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
  multilineInput: { minHeight: 104, paddingTop: 14, textAlignVertical: "top" },
});
