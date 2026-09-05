import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import type {
  DriverEmploymentType,
  DriverLicenseClass,
  DriverListingPayload,
  DriverListingType,
  LogisticsSector,
  MobileDriverListing,
  SectorDetails,
} from "@/api/mobileFreight";
import { FreightOptionPicker } from "@/components/freight-option-picker";
import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { Chip, PageHeader, SurfaceCard } from "@/components/ui";
import {
  currencyOptions,
  dateToInput,
  todayDateInput,
} from "@/features/freight/freight-format";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

const licenseClasses: DriverLicenseClass[] = ["B", "C", "CE", "D", "DE"];
const employmentTypes: DriverEmploymentType[] = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "DAILY",
];
const manualSectors: LogisticsSector[] = [
  "GENERAL_LOGISTICS",
  "HOME_MOVING",
  "PARTIAL_LOAD",
  "HEAVY_HAUL",
];
type Draft = {
  listingType: DriverListingType;
  title: string;
  location: string;
  preferredRoute: string;
  availableFrom: string;
  licenseClasses: DriverLicenseClass[];
  experienceYears: string;
  employmentType: DriverEmploymentType;
  internationalExperience: boolean;
  adrCertificate: boolean;
  srcCertificate: boolean;
  psychotechnicalCertificate: boolean;
  salaryAmount: string;
  currency: string;
  description: string;
  contactPhone: string;
};
type ErrorKey =
  | "title"
  | "location"
  | "availableFrom"
  | "licenseClasses"
  | "experienceYears"
  | "salaryAmount"
  | "contactPhone";

function initialDraft(
  listing: MobileDriverListing | null | undefined,
  phone: string,
  currency: string,
): Draft {
  return {
    listingType: listing?.listingType ?? "DRIVER_WANTED",
    title: listing?.title ?? "",
    location: listing?.location ?? "",
    preferredRoute: listing?.preferredRoute ?? "",
    availableFrom: listing?.availableFrom ?? todayDateInput(),
    licenseClasses: listing?.licenseClasses ?? ["CE"],
    experienceYears: listing ? String(listing.experienceYears) : "0",
    employmentType: listing?.employmentType ?? "FULL_TIME",
    internationalExperience: listing?.internationalExperience ?? false,
    adrCertificate: listing?.adrCertificate ?? false,
    srcCertificate: listing?.srcCertificate ?? false,
    psychotechnicalCertificate: listing?.psychotechnicalCertificate ?? false,
    salaryAmount:
      listing?.salaryAmount == null ? "" : String(listing.salaryAmount),
    currency: listing?.currency ?? currency,
    description: listing?.description ?? "",
    contactPhone: listing?.contactPhone ?? phone,
  };
}

export function DriverListingForm({
  listing,
  defaultPhone,
  defaultCurrency,
  saving,
  error,
  title,
  description,
  submitTitle,
  onSubmit,
  onBack,
  initialSector,
  lockedSector,
}: {
  listing?: MobileDriverListing | null;
  defaultPhone: string;
  defaultCurrency: string;
  saving: boolean;
  error?: string | null;
  title: string;
  description: string;
  submitTitle: string;
  onSubmit: (payload: DriverListingPayload) => Promise<void>;
  onBack?: (() => void) | undefined;
  initialSector?: LogisticsSector | undefined;
  lockedSector?: LogisticsSector | undefined;
}) {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const [draft, setDraft] = useState(() =>
    initialDraft(listing, defaultPhone, defaultCurrency),
  );
  const [errors, setErrors] = useState<Partial<Record<ErrorKey, string>>>({});
  const [sector, setSector] = useState<LogisticsSector>(() =>
    lockedSector || initialSector || listingSector(listing),
  );
  const [sectorDetails, setSectorDetails] = useState<Record<string, string>>(
    () => initialSectorDetails(listing),
  );
  const [employmentOpen, setEmploymentOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  useEffect(() => {
    setDraft(initialDraft(listing, defaultPhone, defaultCurrency));
    setSector(lockedSector || initialSector || listingSector(listing));
    setSectorDetails(initialSectorDetails(listing));
    setErrors({});
  }, [defaultCurrency, defaultPhone, initialSector, listing, lockedSector]);
  const employmentOptions = useMemo(
    () =>
      employmentTypes.map((value) => ({
        value,
        label: employmentLabel(value, t),
      })),
    [t],
  );
  const currencyOptionsForPicker = useMemo(
    () => currencyOptions.map((value) => ({ value, label: value })),
    [],
  );
  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }
  function toggleLicense(value: DriverLicenseClass) {
    update(
      "licenseClasses",
      draft.licenseClasses.includes(value)
        ? draft.licenseClasses.filter((item) => item !== value)
        : [...draft.licenseClasses, value],
    );
  }
  function validate() {
    const next: Partial<Record<ErrorKey, string>> = {};
    const experienceYears = Number(draft.experienceYears);
    const salaryAmount = draft.salaryAmount.trim()
      ? Number(draft.salaryAmount.replace(",", "."))
      : null;
    if (draft.title.trim().length < 3) next.title = t("driverTitleRequired");
    if (draft.location.trim().length < 2)
      next.location = t("driverLocationRequired");
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(draft.availableFrom))
      next.availableFrom = t("freightDateRequired");
    if (!draft.licenseClasses.length)
      next.licenseClasses = t("driverLicenseRequired");
    if (
      !Number.isInteger(experienceYears) ||
      experienceYears < 0 ||
      experienceYears > 60
    )
      next.experienceYears = t("driverExperienceInvalid");
    if (
      salaryAmount != null &&
      (!Number.isFinite(salaryAmount) || salaryAmount <= 0)
    )
      next.salaryAmount = t("freightPriceInvalid");
    if (draft.contactPhone.trim().length < 7)
      next.contactPhone = t("freightPhoneRequired");
    setErrors(next);
    return Object.keys(next).length ? null : { experienceYears, salaryAmount };
  }
  async function submit() {
    const numbers = validate();
    if (!numbers) return;
    await onSubmit({
      listingType: draft.listingType,
      title: draft.title.trim(),
      location: draft.location.trim(),
      preferredRoute: draft.preferredRoute.trim() || null,
      availableFrom: draft.availableFrom,
      licenseClasses: draft.licenseClasses,
      experienceYears: numbers.experienceYears,
      employmentType: draft.employmentType,
      internationalExperience: draft.internationalExperience,
      adrCertificate: draft.adrCertificate,
      srcCertificate: draft.srcCertificate,
      psychotechnicalCertificate: draft.psychotechnicalCertificate,
      salaryAmount: numbers.salaryAmount,
      currency: numbers.salaryAmount == null ? null : draft.currency,
      description: draft.description.trim() || null,
      contactPhone: draft.contactPhone.trim(),
      primarySector: sector,
      sectorDetails: cleanSectorDetails(sectorDetails),
    });
  }
  function onDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === "android") setDateOpen(false);
    if (event.type === "set" && selected)
      update("availableFrom", dateToInput(selected));
  }
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 96 : 0}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {onBack ? <BackButton onPress={onBack} /> : null}
        <PageHeader
          eyebrow={t("logisticsMarketplace")}
          title={title}
          description={description}
        />
        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t("logisticsSector")}
          </Text>
          <View style={styles.sectorButtons}>
            {manualSectors.map((value) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: sector === value,
                  disabled: Boolean(lockedSector),
                }}
                disabled={Boolean(lockedSector)}
                onPress={() => {
                  setSector(value);
                  setSectorDetails({});
                }}
                style={[
                  styles.sectorButton,
                  {
                    borderColor:
                      sector === value ? theme.primary : theme.border,
                    backgroundColor:
                      sector === value ? theme.badge : theme.cardMuted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.sectorButtonText,
                    { color: sector === value ? theme.primary : theme.text },
                  ]}
                >
                  {sectorLabel(value, locale)}
                </Text>
              </Pressable>
            ))}
          </View>
          {sector !== "GENERAL_LOGISTICS" ? (
            <View style={styles.sectorFields}>
              {driverSectorFields(sector, locale).map(([key, label]) => (
                <TextField
                  key={key}
                  label={label}
                  maxLength={240}
                  value={sectorDetails[key] ?? ""}
                  onChangeText={(value) =>
                    setSectorDetails((current) => ({
                      ...current,
                      [key]: value,
                    }))
                  }
                />
              ))}
            </View>
          ) : null}
        </SurfaceCard>
        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t("driverListingPurpose")}
          </Text>
          <View style={styles.chips}>
            <Chip
              label={t("driverWanted")}
              active={draft.listingType === "DRIVER_WANTED"}
              onPress={() => update("listingType", "DRIVER_WANTED")}
            />
            <Chip
              label={t("driverAvailable")}
              active={draft.listingType === "DRIVER_AVAILABLE"}
              onPress={() => update("listingType", "DRIVER_AVAILABLE")}
            />
          </View>
          <Text style={[styles.helper, { color: theme.muted }]}>
            {t(
              draft.listingType === "DRIVER_WANTED"
                ? "driverWantedDescription"
                : "driverAvailableDescription",
            )}
          </Text>
        </SurfaceCard>
        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t("driverBasicInformation")}
          </Text>
          <FieldError error={errors.title}>
            <TextField
              label={t("driverListingTitle")}
              maxLength={140}
              value={draft.title}
              onChangeText={(value) => update("title", value)}
            />
          </FieldError>
          <FieldError error={errors.location}>
            <TextField
              label={t("driverLocation")}
              maxLength={160}
              value={draft.location}
              onChangeText={(value) => update("location", value)}
            />
          </FieldError>
          <TextField
            label={t("preferredRouteOptional")}
            maxLength={200}
            value={draft.preferredRoute}
            onChangeText={(value) => update("preferredRoute", value)}
          />
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.text }]}>
              {t("availableFrom")}
            </Text>
            <Pressable
              onPress={() => setDateOpen(true)}
              style={[
                styles.dateControl,
                {
                  backgroundColor: theme.input,
                  borderColor: errors.availableFrom
                    ? theme.danger
                    : theme.border,
                },
              ]}
            >
              <Text style={{ color: theme.text, fontWeight: "700" }}>
                {draft.availableFrom}
              </Text>
            </Pressable>
            {errors.availableFrom ? (
              <Text style={[styles.error, { color: theme.danger }]}>
                {errors.availableFrom}
              </Text>
            ) : null}
            {dateOpen ? (
              <DateTimePicker
                minimumDate={new Date()}
                mode="date"
                value={new Date(`${draft.availableFrom}T12:00:00`)}
                onChange={onDateChange}
              />
            ) : null}
          </View>
        </SurfaceCard>
        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t("driverQualifications")}
          </Text>
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.text }]}>
              {t("driverLicenseClasses")}
            </Text>
            <View style={styles.chips}>
              {licenseClasses.map((value) => (
                <Chip
                  key={value}
                  label={value}
                  active={draft.licenseClasses.includes(value)}
                  onPress={() => toggleLicense(value)}
                />
              ))}
            </View>
            {errors.licenseClasses ? (
              <Text style={[styles.error, { color: theme.danger }]}>
                {errors.licenseClasses}
              </Text>
            ) : null}
          </View>
          <View style={styles.columns}>
            <View style={styles.column}>
              <FieldError error={errors.experienceYears}>
                <TextField
                  label={t("driverExperienceYears")}
                  keyboardType="number-pad"
                  value={draft.experienceYears}
                  onChangeText={(value) => update("experienceYears", value)}
                />
              </FieldError>
            </View>
            <View style={styles.column}>
              <FreightOptionPicker
                label={t("driverEmploymentType")}
                value={draft.employmentType}
                placeholder={t("driverEmploymentType")}
                options={employmentOptions}
                open={employmentOpen}
                onOpen={() => setEmploymentOpen(true)}
                onClose={() => setEmploymentOpen(false)}
                onChange={(value) => update("employmentType", value)}
              />
            </View>
          </View>
          <SwitchRow
            label={t("internationalExperience")}
            value={draft.internationalExperience}
            onChange={(value) => update("internationalExperience", value)}
          />
          <SwitchRow
            label={t("driverSrcCertificate")}
            value={draft.srcCertificate}
            onChange={(value) => update("srcCertificate", value)}
          />
          <SwitchRow
            label={t("driverPsychotechnicalCertificate")}
            value={draft.psychotechnicalCertificate}
            onChange={(value) => update("psychotechnicalCertificate", value)}
          />
          <SwitchRow
            label={t("driverAdrCertificate")}
            value={draft.adrCertificate}
            onChange={(value) => update("adrCertificate", value)}
          />
        </SurfaceCard>
        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t("freightCommercialSection")}
          </Text>
          <View style={styles.columns}>
            <View style={styles.column}>
              <FieldError error={errors.salaryAmount}>
                <TextField
                  label={t("driverSalaryOptional")}
                  keyboardType="decimal-pad"
                  value={draft.salaryAmount}
                  onChangeText={(value) => update("salaryAmount", value)}
                />
              </FieldError>
            </View>
            <View style={styles.column}>
              <FreightOptionPicker
                label={t("freightCurrency")}
                value={draft.currency}
                placeholder={t("freightCurrency")}
                options={currencyOptionsForPicker}
                open={currencyOpen}
                onOpen={() => setCurrencyOpen(true)}
                onClose={() => setCurrencyOpen(false)}
                onChange={(value) => update("currency", value)}
              />
            </View>
          </View>
          <FieldError error={errors.contactPhone}>
            <TextField
              label={t("freightContactPhone")}
              keyboardType="phone-pad"
              maxLength={32}
              value={draft.contactPhone}
              onChangeText={(value) => update("contactPhone", value)}
            />
          </FieldError>
          <TextField
            label={t("freightDescriptionOptional")}
            maxLength={2000}
            multiline
            style={styles.multiline}
            value={draft.description}
            onChangeText={(value) => update("description", value)}
          />
        </SurfaceCard>
        {error ? (
          <Text
            style={[
              styles.submitError,
              { backgroundColor: theme.dangerSoft, color: theme.danger },
            ]}
          >
            {error}
          </Text>
        ) : null}
        <PrimaryButton
          title={submitTitle}
          icon="send-outline"
          loading={saving}
          onPress={() => void submit()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function employmentLabel(
  value: DriverEmploymentType,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (value === "FULL_TIME") return t("driverEmploymentFULL_TIME");
  if (value === "PART_TIME") return t("driverEmploymentPART_TIME");
  if (value === "CONTRACT") return t("driverEmploymentCONTRACT");
  return t("driverEmploymentDAILY");
}
function FieldError({
  error,
  children,
}: {
  error?: string | undefined;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      {children}
      {error ? (
        <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>
      ) : null}
    </View>
  );
}
function SwitchRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.switchRow, { borderColor: theme.border }]}>
      <Text style={[styles.switchTitle, { color: theme.text }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.primary }}
      />
    </View>
  );
}
function BackButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.back}>
      <Ionicons name="arrow-back" size={21} color={theme.primary} />
      <Text style={{ color: theme.primary, fontWeight: "900" }}>
        {t("back")}
      </Text>
    </Pressable>
  );
}

function listingSector(
  listing: MobileDriverListing | null | undefined,
): LogisticsSector {
  const value = listing?.primarySector;
  return value && manualSectors.includes(value as LogisticsSector)
    ? (value as LogisticsSector)
    : "GENERAL_LOGISTICS";
}

function initialSectorDetails(
  listing: MobileDriverListing | null | undefined,
): Record<string, string> {
  if (!listing?.sectorDetails) return {};
  return Object.fromEntries(
    Object.entries(listing.sectorDetails)
      .filter(([, value]) =>
        ["string", "number", "boolean"].includes(typeof value),
      )
      .map(([key, value]) => [key, String(value)]),
  );
}

function cleanSectorDetails(value: Record<string, string>): SectorDetails | null {
  const entries = Object.entries(value)
    .map(([key, item]) => [key, item.trim()] as const)
    .filter(([, item]) => item.length > 0);
  return entries.length ? Object.fromEntries(entries) : null;
}

function sectorLabel(sector: LogisticsSector, locale: string) {
  const copy = (tr: string, en: string, ar: string) => locale === "tr" ? tr : locale === "ar" ? ar : en;
  if (sector === "HOME_MOVING") return copy("Evden eve", "Home moving", "النقل المنزلي");
  if (sector === "PARTIAL_LOAD") return copy("Parsiyel yük", "Partial load", "الشحن الجزئي");
  if (sector === "HEAVY_HAUL") return copy("Ağır nakliye", "Heavy haul", "النقل الثقيل");
  return copy("Genel lojistik", "General logistics", "الخدمات اللوجستية العامة");
}

function driverSectorFields(
  sector: LogisticsSector,
  locale: string,
): Array<[string, string]> {
  const copy = (tr: string, en: string, ar: string) => locale === "tr" ? tr : locale === "ar" ? ar : en;
  if (sector === "HOME_MOVING") {
    return [
      ["movingExperience", copy("Taşınma deneyimi", "Moving experience", "خبرة النقل")],
      ["packingExperience", copy("Paketleme deneyimi", "Packing experience", "خبرة التغليف")],
      ["elevatorOperator", copy("Asansör kullanım deneyimi", "Elevator operation experience", "خبرة تشغيل المصاعد")],
    ];
  }
  if (sector === "PARTIAL_LOAD") {
    return [
      ["routeExperience", copy("Rota deneyimi", "Route experience", "خبرة المسارات")],
      ["palletHandling", copy("Palet elleçleme deneyimi", "Pallet handling", "مناولة المنصات")],
      ["groupageExperience", copy("Parsiyel taşıma deneyimi", "Groupage experience", "خبرة الشحن المجمّع")],
    ];
  }
  if (sector === "HEAVY_HAUL") {
    return [
      ["heavyHaulExperience", copy("Ağır nakliye deneyimi", "Heavy-haul experience", "خبرة النقل الثقيل")],
      ["lowbedExperience", copy("Lowbed deneyimi", "Lowbed experience", "خبرة المقطورات المنخفضة")],
      ["permitEscortExperience", copy("İzin ve eskort deneyimi", "Permit and escort experience", "خبرة التصاريح والمرافقة")],
    ];
  }
  return [];
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { gap: 16, padding: 18, paddingBottom: 44 },
  back: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
  },
  card: { gap: 14 },
  sectorButtons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sectorButton: {
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 12,
  },
  sectorButtonText: { fontSize: 12, fontWeight: "900" },
  sectorFields: { gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "900" },
  helper: { fontSize: 12, lineHeight: 18 },
  field: { gap: 7 },
  label: { fontSize: 13, fontWeight: "800" },
  error: { fontSize: 12, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 2 },
  columns: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  column: { flex: 1, minWidth: 140 },
  dateControl: {
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: 16,
  },
  switchRow: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 58,
    padding: 14,
  },
  switchTitle: { flex: 1, fontSize: 14, fontWeight: "800", paddingRight: 10 },
  multiline: { minHeight: 112, paddingTop: 14, textAlignVertical: "top" },
  submitError: {
    borderRadius: 14,
    fontSize: 13,
    fontWeight: "800",
    padding: 14,
  },
});
