import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
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
  FreightTrailerType,
  LogisticsSector,
  MobileVehicleListing,
  SectorDetails,
  VehicleListingPayload,
} from "@/api/mobileFreight";
import { FreightOptionPicker } from "@/components/freight-option-picker";
import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { PageHeader, SurfaceCard } from "@/components/ui";
import {
  currencyOptions,
  dateToInput,
  todayDateInput,
  trailerOptions,
} from "@/features/freight/freight-format";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

type Draft = {
  origin: string;
  destination: string;
  availableFrom: string;
  availableUntil: string;
  trailerType: FreightTrailerType | null;
  capacityWeight: string;
  vehicleCount: string;
  internationalTransport: boolean;
  adrSuitable: boolean;
  priceAmount: string;
  currency: string;
  description: string;
  contactPhone: string;
};
type ErrorKey =
  | "origin"
  | "availableFrom"
  | "availableUntil"
  | "trailerType"
  | "capacityWeight"
  | "vehicleCount"
  | "priceAmount"
  | "contactPhone";

const manualSectors: LogisticsSector[] = ["GENERAL_LOGISTICS", "HOME_MOVING", "PARTIAL_LOAD", "HEAVY_HAUL"];

function initialDraft(
  listing: MobileVehicleListing | null | undefined,
  phone: string,
  currency: string,
): Draft {
  return {
    origin: listing?.origin ?? "",
    destination: listing?.destination ?? "",
    availableFrom: listing?.availableFrom ?? todayDateInput(),
    availableUntil: listing?.availableUntil ?? "",
    trailerType: listing?.trailerType ?? null,
    capacityWeight:
      listing?.capacityWeight == null ? "" : String(listing.capacityWeight),
    vehicleCount: listing ? String(listing.vehicleCount) : "1",
    internationalTransport: listing?.internationalTransport ?? false,
    adrSuitable: listing?.adrSuitable ?? false,
    priceAmount:
      listing?.priceAmount == null ? "" : String(listing.priceAmount),
    currency: listing?.currency ?? currency,
    description: listing?.description ?? "",
    contactPhone: listing?.contactPhone ?? phone,
  };
}

export function VehicleListingForm({
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
  headerAddon,
  initialSector,
  lockedSector,
}: {
  listing?: MobileVehicleListing | null;
  defaultPhone: string;
  defaultCurrency: string;
  saving: boolean;
  error?: string | null;
  title: string;
  description: string;
  submitTitle: string;
  onSubmit: (payload: VehicleListingPayload) => Promise<void>;
  onBack?: (() => void) | undefined;
  headerAddon?: ReactNode;
  initialSector?: LogisticsSector | undefined;
  lockedSector?: LogisticsSector | undefined;
}) {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const [draft, setDraft] = useState(() =>
    initialDraft(listing, defaultPhone, defaultCurrency),
  );
  const [errors, setErrors] = useState<Partial<Record<ErrorKey, string>>>({});
  const [sector, setSector] = useState<LogisticsSector>(() => lockedSector || initialSector || listingSector(listing));
  const [sectorDetails, setSectorDetails] = useState<Record<string, string>>(() => initialSectorDetails(listing));
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [datePicker, setDatePicker] = useState<"FROM" | "UNTIL" | null>(null);
  useEffect(() => {
    setDraft(initialDraft(listing, defaultPhone, defaultCurrency));
    setSector(lockedSector || initialSector || listingSector(listing));
    setSectorDetails(initialSectorDetails(listing));
    setErrors({});
  }, [defaultCurrency, defaultPhone, initialSector, listing, lockedSector]);
  const trailerPickerOptions = useMemo(
    () =>
      trailerOptions.map((option) => ({
        value: option.value,
        label: t(option.labelKey),
      })),
    [t],
  );
  const currencyPickerOptions = useMemo(
    () => currencyOptions.map((value) => ({ value, label: value })),
    [],
  );

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }
  function validate() {
    const next: Partial<Record<ErrorKey, string>> = {};
    const capacityWeight = draft.capacityWeight.trim()
      ? Number(draft.capacityWeight.replace(",", "."))
      : null;
    const vehicleCount = Number(draft.vehicleCount);
    const priceAmount = draft.priceAmount.trim()
      ? Number(draft.priceAmount.replace(",", "."))
      : null;
    if (draft.origin.trim().length < 2)
      next.origin = t("freightOriginRequired");
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(draft.availableFrom))
      next.availableFrom = t("freightDateRequired");
    if (draft.availableUntil && draft.availableUntil < draft.availableFrom)
      next.availableUntil = t("marketplaceDateRangeInvalid");
    if (!draft.trailerType) next.trailerType = t("freightTrailerRequired");
    if (
      capacityWeight != null &&
      (!Number.isFinite(capacityWeight) ||
        capacityWeight <= 0 ||
        capacityWeight > 200)
    )
      next.capacityWeight = t("freightWeightInvalid");
    if (
      !Number.isInteger(vehicleCount) ||
      vehicleCount < 1 ||
      vehicleCount > 100
    )
      next.vehicleCount = t("freightVehicleCountInvalid");
    if (
      priceAmount != null &&
      (!Number.isFinite(priceAmount) || priceAmount <= 0)
    )
      next.priceAmount = t("freightPriceInvalid");
    if (draft.contactPhone.trim().length < 7)
      next.contactPhone = t("freightPhoneRequired");
    setErrors(next);
    return Object.keys(next).length
      ? null
      : { capacityWeight, vehicleCount, priceAmount };
  }
  async function submit() {
    const numbers = validate();
    if (!numbers || !draft.trailerType) return;
    await onSubmit({
      origin: draft.origin.trim(),
      destination: draft.destination.trim() || null,
      availableFrom: draft.availableFrom,
      availableUntil: draft.availableUntil || null,
      trailerType: draft.trailerType,
      capacityWeight: numbers.capacityWeight,
      vehicleCount: numbers.vehicleCount,
      internationalTransport: draft.internationalTransport,
      adrSuitable: draft.adrSuitable,
      priceAmount: numbers.priceAmount,
      currency: numbers.priceAmount == null ? null : draft.currency,
      description: draft.description.trim() || null,
      contactPhone: draft.contactPhone.trim(),
      primarySector: sector,
      sectorDetails: cleanSectorDetails(sectorDetails),
    });
  }
  function onDateChange(event: DateTimePickerEvent, selected?: Date) {
    const target = datePicker;
    if (Platform.OS === "android") setDatePicker(null);
    if (event.type === "set" && selected && target)
      update(
        target === "FROM" ? "availableFrom" : "availableUntil",
        dateToInput(selected),
      );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.flex}
      keyboardVerticalOffset={Platform.OS === "ios" ? 96 : 0}
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
        {headerAddon}
        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t("logisticsSector")}</Text>
          <View style={styles.sectorButtons}>{manualSectors.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: sector === value, disabled: Boolean(lockedSector) }} disabled={Boolean(lockedSector)} onPress={() => { setSector(value); setSectorDetails({}); }} style={[styles.sectorButton, { borderColor: sector === value ? theme.primary : theme.border, backgroundColor: sector === value ? theme.badge : theme.cardMuted }]}><Text style={[styles.sectorButtonText, { color: sector === value ? theme.primary : theme.text }]}>{sectorLabel(value, locale)}</Text></Pressable>)}</View>
          {sector !== "GENERAL_LOGISTICS" ? <View style={styles.sectorFields}>{vehicleSectorFields(sector, locale).map(([key, label]) => <TextField key={key} label={label} maxLength={240} value={sectorDetails[key] ?? ""} onChangeText={(value) => setSectorDetails((current) => ({ ...current, [key]: value }))} />)}</View> : null}
        </SurfaceCard>
        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t("vehicleRouteAvailability")}
          </Text>
          <FieldError error={errors.origin}>
            <TextField
              label={t("vehicleCurrentLocation")}
              maxLength={160}
              value={draft.origin}
              onChangeText={(value) => update("origin", value)}
            />
          </FieldError>
          <TextField
            label={t("vehiclePreferredDestinationOptional")}
            maxLength={160}
            value={draft.destination}
            onChangeText={(value) => update("destination", value)}
          />
          <DateControl
            label={t("availableFrom")}
            value={draft.availableFrom}
            error={errors.availableFrom}
            onPress={() => setDatePicker("FROM")}
          />
          <DateControl
            label={t("availableUntilOptional")}
            value={draft.availableUntil || t("notSpecified")}
            error={errors.availableUntil}
            onPress={() => setDatePicker("UNTIL")}
            onClear={
              draft.availableUntil
                ? () => update("availableUntil", "")
                : undefined
            }
          />
          {datePicker ? (
            <DateTimePicker
              minimumDate={
                datePicker === "UNTIL"
                  ? new Date(`${draft.availableFrom}T12:00:00`)
                  : new Date()
              }
              mode="date"
              value={
                datePicker === "UNTIL" && draft.availableUntil
                  ? new Date(`${draft.availableUntil}T12:00:00`)
                  : new Date(`${draft.availableFrom}T12:00:00`)
              }
              onChange={onDateChange}
            />
          ) : null}
        </SurfaceCard>
        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t("vehicleCapacityFeatures")}
          </Text>
          <FreightOptionPicker
            label={t("freightTrailerType")}
            value={draft.trailerType}
            placeholder={t("freightSelectTrailer")}
            options={trailerPickerOptions}
            open={trailerOpen}
            onOpen={() => setTrailerOpen(true)}
            onClose={() => setTrailerOpen(false)}
            onChange={(value) => update("trailerType", value)}
            error={errors.trailerType}
          />
          <View style={styles.columns}>
            <View style={styles.column}>
              <FieldError error={errors.capacityWeight}>
                <TextField
                  label={t("vehicleCapacityTonnesOptional")}
                  keyboardType="decimal-pad"
                  value={draft.capacityWeight}
                  onChangeText={(value) => update("capacityWeight", value)}
                />
              </FieldError>
            </View>
            <View style={styles.column}>
              <FieldError error={errors.vehicleCount}>
                <TextField
                  label={t("freightVehicleCount")}
                  keyboardType="number-pad"
                  value={draft.vehicleCount}
                  onChangeText={(value) => update("vehicleCount", value)}
                />
              </FieldError>
            </View>
          </View>
          <SwitchRow
            label={t("internationalTransport")}
            description={t("internationalTransportDescription")}
            value={draft.internationalTransport}
            onChange={(value) => update("internationalTransport", value)}
          />
          <SwitchRow
            label={t("adrSuitable")}
            description={t("adrSuitableDescription")}
            value={draft.adrSuitable}
            onChange={(value) => update("adrSuitable", value)}
          />
        </SurfaceCard>
        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t("freightCommercialSection")}
          </Text>
          <View style={styles.columns}>
            <View style={styles.column}>
              <FieldError error={errors.priceAmount}>
                <TextField
                  label={t("vehiclePriceOptional")}
                  keyboardType="decimal-pad"
                  value={draft.priceAmount}
                  onChangeText={(value) => update("priceAmount", value)}
                />
              </FieldError>
            </View>
            <View style={styles.column}>
              <FreightOptionPicker
                label={t("freightCurrency")}
                value={draft.currency}
                placeholder={t("freightCurrency")}
                options={currencyPickerOptions}
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
function DateControl({
  label,
  value,
  error,
  onPress,
  onClear,
}: {
  label: string;
  value: string;
  error?: string | undefined;
  onPress: () => void;
  onClear?: (() => void) | undefined;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <View style={styles.dateRow}>
        <Pressable
          onPress={onPress}
          style={[
            styles.dateControl,
            {
              backgroundColor: theme.input,
              borderColor: error ? theme.danger : theme.border,
            },
          ]}
        >
          <Text style={{ color: theme.text, fontWeight: "700" }}>{value}</Text>
        </Pressable>
        {onClear ? (
          <Pressable onPress={onClear} style={styles.clear}>
            <Text style={{ color: theme.primary, fontWeight: "900" }}>
              {t("clear")}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>
      ) : null}
    </View>
  );
}
function SwitchRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.switchRow, { borderColor: theme.border }]}>
      <View style={styles.switchCopy}>
        <Text style={[styles.switchTitle, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.switchDescription, { color: theme.muted }]}>
          {description}
        </Text>
      </View>
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
  listing: MobileVehicleListing | null | undefined,
): LogisticsSector {
  const value = listing?.primarySector;
  return value && manualSectors.includes(value as LogisticsSector)
    ? (value as LogisticsSector)
    : "GENERAL_LOGISTICS";
}

function initialSectorDetails(
  listing: MobileVehicleListing | null | undefined,
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

function vehicleSectorFields(
  sector: LogisticsSector,
  locale: string,
): Array<[string, string]> {
  const copy = (tr: string, en: string, ar: string) => locale === "tr" ? tr : locale === "ar" ? ar : en;
  if (sector === "HOME_MOVING") {
    return [
      ["vehicleType", copy("Araç tipi", "Vehicle type", "نوع المركبة")],
      ["volumeCapacity", copy("Hacim kapasitesi", "Volume capacity", "السعة الحجمية")],
      ["externalElevator", copy("Dış cephe asansörü", "External elevator", "مصعد خارجي")],
      ["packingService", copy("Paketleme hizmeti", "Packing service", "خدمة التغليف")],
      ["crewSize", copy("Ekip büyüklüğü", "Crew size", "حجم الطاقم")],
    ];
  }
  if (sector === "PARTIAL_LOAD") {
    return [
      ["volumeM3", copy("Hacim (m³)", "Volume (m³)", "الحجم (م³)")],
      ["palletCapacity", copy("Palet kapasitesi", "Pallet capacity", "سعة المنصات")],
      ["routeCoverage", copy("Hizmet verilen rotalar", "Route coverage", "المسارات المغطاة")],
    ];
  }
  if (sector === "HEAVY_HAUL") {
    return [
      ["lowbedType", copy("Lowbed tipi", "Lowbed type", "نوع المقطورة المنخفضة")],
      ["bedDimensions", copy("Dorse ölçüleri", "Bed dimensions", "أبعاد سطح المقطورة")],
      ["permitSupport", copy("İzin desteği", "Permit support", "دعم التصاريح")],
      ["escortSupport", copy("Eskort desteği", "Escort support", "دعم المرافقة")],
      ["loadingEquipment", copy("Yükleme ekipmanı", "Loading equipment", "معدات التحميل")],
    ];
  }
  return [];
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { gap: 16, padding: 18, paddingBottom: 150 },
  back: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
  },
  card: { gap: 14 },
  sectorButtons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sectorButton: { borderRadius: 999, borderWidth: 1, minHeight: 40, justifyContent: "center", paddingHorizontal: 12 },
  sectorButtonText: { fontSize: 12, fontWeight: "900" },
  sectorFields: { gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "900" },
  field: { gap: 7 },
  error: { fontSize: 12, fontWeight: "700" },
  columns: { gap: 12 },
  column: { width: "100%" },
  label: { fontSize: 13, fontWeight: "800" },
  dateRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  dateControl: {
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: 16,
  },
  clear: { justifyContent: "center", minHeight: 44, paddingHorizontal: 5 },
  switchRow: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  switchCopy: { flex: 1, gap: 4 },
  switchTitle: { fontSize: 14, fontWeight: "900" },
  switchDescription: { fontSize: 12, lineHeight: 17 },
  multiline: { minHeight: 112, paddingTop: 14, textAlignVertical: "top" },
  submitError: {
    borderRadius: 14,
    fontSize: 13,
    fontWeight: "800",
    padding: 14,
  },
});
