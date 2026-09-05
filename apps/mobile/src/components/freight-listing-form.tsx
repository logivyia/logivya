import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { FreightContainerStatus, FreightListingPayload, FreightTrailerType, LogisticsSector, MobileFreightListing, SectorDetails } from "@/api/mobileFreight";
import { FreightOptionPicker } from "@/components/freight-option-picker";
import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { Chip, PageHeader, SurfaceCard } from "@/components/ui";
import { containerOptions, currencyOptions, dateToInput, todayDateInput, trailerOptions } from "@/features/freight/freight-format";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

type Draft = {
  origin: string;
  destination: string;
  loadingDate: string;
  cargoType: string;
  weight: string;
  trailerType: FreightTrailerType | null;
  vehicleCount: string;
  priceAmount: string;
  currency: string;
  customsInfo: string;
  containerStatus: FreightContainerStatus;
  description: string;
  contactPhone: string;
};

type ErrorKey = keyof Pick<Draft, "origin" | "destination" | "loadingDate" | "weight" | "trailerType" | "vehicleCount" | "priceAmount" | "contactPhone">;

function initialDraft(listing: MobileFreightListing | null | undefined, phone: string, currency: string): Draft {
  return {
    origin: listing?.origin ?? "",
    destination: listing?.destination ?? "",
    loadingDate: listing?.loadingDate ?? todayDateInput(),
    cargoType: listing?.cargoType ?? "",
    weight: listing?.weight == null ? "" : String(listing.weight),
    trailerType: listing?.trailerType ?? null,
    vehicleCount: listing ? String(listing.vehicleCount) : "1",
    priceAmount: listing?.priceAmount == null ? "" : String(listing.priceAmount),
    currency: listing?.currency ?? currency,
    customsInfo: listing?.customsInfo ?? "",
    containerStatus: listing?.containerStatus ?? "NONE",
    description: listing?.description ?? "",
    contactPhone: listing?.contactPhone ?? phone,
  };
}

const manualSectors: LogisticsSector[] = ["GENERAL_LOGISTICS", "HOME_MOVING", "PARTIAL_LOAD", "HEAVY_HAUL"];

function initialManualSector(listing: MobileFreightListing | null | undefined, initialSector?: LogisticsSector) {
  return initialSector || (manualSectors.includes(listing?.primarySector as LogisticsSector)
    ? listing?.primarySector as LogisticsSector
    : "GENERAL_LOGISTICS");
}

function initialSectorDetails(listing: MobileFreightListing | null | undefined): Record<string, string> {
  if (!listing?.sectorDetails || typeof listing.sectorDetails !== "object") return {};
  return Object.fromEntries(Object.entries(listing.sectorDetails)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => [key, value as string]));
}

function sectorFieldCopy(locale: string, sector: LogisticsSector) {
  const copy = (tr: string, en: string, ar: string) => locale === "tr" ? tr : locale === "ar" ? ar : en;
  if (sector === "HOME_MOVING") return {
    title: copy("Evden eve taşıma bilgileri", "Home-moving details", "تفاصيل النقل المنزلي"),
    help: copy("İhtiyacınıza uyan alanları doldurun; bu alanların hiçbiri tek başına zorunlu değildir.", "Complete only the fields relevant to your move; none is mandatory by itself.", "أكمل الحقول المناسبة لعملية النقل فقط؛ لا يُعد أي حقل منها إلزاميًا بمفرده."),
    fields: [
      ["propertyType", copy("Ev / ofis ve mülk tipi", "Home / office and property type", "نوع المنزل أو المكتب والعقار")],
      ["roomCount", copy("Oda sayısı (örn. 2+1)", "Room count (for example 2+1)", "عدد الغرف (مثلاً 2+1)")],
      ["pickupFloor", copy("Alış katı ve asansör", "Pickup floor and elevator", "طابق الاستلام والمصعد")],
      ["deliveryFloor", copy("Teslim katı ve asansör", "Delivery floor and elevator", "طابق التسليم والمصعد")],
      ["serviceRequirements", copy("Paketleme, montaj, ekip veya dış asansör ihtiyacı", "Packing, assembly, crew, or external elevator needs", "احتياجات التغليف والتركيب والطاقم أو المصعد الخارجي")],
    ],
  } as const;
  if (sector === "PARTIAL_LOAD") return {
    title: copy("Parsiyel yük bilgileri", "Partial-load details", "تفاصيل الشحن الجزئي"),
    help: copy("Ağırlık yerine hacim, palet, koli veya ölçü bilgisinden en az birini kullanabilirsiniz.", "You may use volume, pallet, package, or dimension data instead of weight.", "يمكنك إدخال الحجم أو عدد المنصات أو الطرود أو الأبعاد بدلاً من الوزن."),
    fields: [
      ["volumeM3", copy("Hacim (m³)", "Volume (m³)", "الحجم (م³)")],
      ["palletCount", copy("Palet sayısı", "Pallet count", "عدد المنصات")],
      ["packageCount", copy("Koli / paket sayısı", "Package count", "عدد الطرود")],
      ["dimensions", copy("Ölçüler", "Dimensions", "الأبعاد")],
      ["deliveryMode", copy("Terminal, depo veya kapı teslimi", "Terminal, warehouse, or door delivery", "التسليم في المحطة أو المستودع أو الباب")],
    ],
  } as const;
  return {
    title: copy("Ağır nakliyat bilgileri", "Heavy-haul details", "تفاصيل النقل الثقيل"),
    help: copy("Bildiğiniz mühendislik ve ekipman bilgilerini girin; bilinmeyen ölçüler tahmin edilmez.", "Enter only known engineering and equipment details; unknown dimensions are never inferred.", "أدخل معلومات الهندسة والمعدات المعروفة فقط؛ لا تُفترض الأبعاد غير المعروفة."),
    fields: [
      ["machineryType", copy("Makine / proje yükü türü", "Machinery / project cargo type", "نوع الآلة أو حمولة المشروع")],
      ["dimensions", copy("Uzunluk × genişlik × yükseklik", "Length × width × height", "الطول × العرض × الارتفاع")],
      ["trailerConfiguration", copy("Lowbed / uzamalı / modüler dorse ihtiyacı", "Lowbed / extendable / modular trailer need", "متطلبات مقطورة منخفضة أو قابلة للتمديد أو معيارية")],
      ["permitEscort", copy("İzin, eskort veya güzergâh etüdü", "Permit, escort, or route survey", "التصريح أو المرافقة أو دراسة المسار")],
      ["loadingEquipment", copy("Yükleme / boşaltma ve vinç ihtiyacı", "Loading / unloading and crane needs", "احتياجات التحميل والتفريغ والرافعة")],
    ],
  } as const;
}

export function FreightListingForm({
  listing,
  defaultPhone,
  defaultCurrency,
  saving,
  error,
  submitTitle,
  title,
  description,
  initialSector,
  sectorLocked = false,
  onSubmit,
}: {
  listing?: MobileFreightListing | null;
  defaultPhone: string;
  defaultCurrency: string;
  saving: boolean;
  error?: string | null;
  submitTitle: string;
  title: string;
  description: string;
  initialSector?: LogisticsSector;
  sectorLocked?: boolean;
  onSubmit: (payload: FreightListingPayload) => Promise<void>;
}) {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const [draft, setDraft] = useState(() => initialDraft(listing, defaultPhone, defaultCurrency));
  const [sector, setSector] = useState<LogisticsSector>(() => initialManualSector(listing, initialSector));
  const [sectorDetails, setSectorDetails] = useState<Record<string, string>>(() => initialSectorDetails(listing));
  const [sectorDetailsOpen, setSectorDetailsOpen] = useState(Boolean(listing?.sectorDetails || (initialSector && initialSector !== "GENERAL_LOGISTICS")));
  const [errors, setErrors] = useState<Partial<Record<ErrorKey, string>>>({});
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [containerOpen, setContainerOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  useEffect(() => {
    setDraft(initialDraft(listing, defaultPhone, defaultCurrency));
    setSector(initialManualSector(listing, initialSector));
    setSectorDetails(initialSectorDetails(listing));
    setSectorDetailsOpen(Boolean(listing?.sectorDetails || (initialSector && initialSector !== "GENERAL_LOGISTICS")));
    setErrors({});
  }, [defaultCurrency, defaultPhone, initialSector, listing]);

  const trailerPickerOptions = useMemo(() => trailerOptions.map((option) => ({ value: option.value, label: t(option.labelKey) })), [t]);
  const containerPickerOptions = useMemo(() => containerOptions.map((option) => ({ value: option.value, label: t(option.labelKey) })), [t]);
  const currencyPickerOptions = useMemo(() => currencyOptions.map((value) => ({ value, label: value })), []);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const next: Partial<Record<ErrorKey, string>> = {};
    const weight = draft.weight.trim() ? Number(draft.weight.replace(",", ".")) : null;
    const vehicleCount = Number(draft.vehicleCount);
    const price = draft.priceAmount.trim() ? Number(draft.priceAmount.replace(",", ".")) : null;
    if (draft.origin.trim().length < 2) next.origin = t("freightOriginRequired");
    if (draft.destination.trim().length < 2) next.destination = t("freightDestinationRequired");
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(draft.loadingDate)) next.loadingDate = t("freightDateRequired");
    const hasPartialQuantity = ["volumeM3", "palletCount", "packageCount", "dimensions"].some((key) => sectorDetails[key]?.trim());
    if (weight != null && (!Number.isFinite(weight) || weight <= 0 || weight > 200)) next.weight = t("freightWeightInvalid");
    if (weight == null && sector !== "HOME_MOVING" && !(sector === "PARTIAL_LOAD" && hasPartialQuantity)) next.weight = t("freightWeightInvalid");
    if (!draft.trailerType) next.trailerType = t("freightTrailerRequired");
    if (!Number.isInteger(vehicleCount) || vehicleCount < 1 || vehicleCount > 100) next.vehicleCount = t("freightVehicleCountInvalid");
    if (price != null && (!Number.isFinite(price) || price <= 0)) next.priceAmount = t("freightPriceInvalid");
    if (draft.contactPhone.trim().length < 7) next.contactPhone = t("freightPhoneRequired");
    setErrors(next);
    return Object.keys(next).length === 0 ? { weight, vehicleCount, price } : null;
  }

  async function submit() {
    const numeric = validate();
    if (!numeric || !draft.trailerType) return;
    await onSubmit({
      origin: draft.origin.trim(),
      destination: draft.destination.trim(),
      loadingDate: draft.loadingDate,
      cargoType: draft.cargoType.trim() || null,
      weight: numeric.weight,
      trailerType: draft.trailerType,
      vehicleCount: numeric.vehicleCount,
      priceAmount: numeric.price,
      currency: numeric.price == null ? null : draft.currency,
      customsInfo: draft.customsInfo.trim() || null,
      containerStatus: draft.containerStatus,
      description: draft.description.trim() || null,
      contactPhone: draft.contactPhone.trim(),
      primarySector: sector,
      sectorDetails: Object.keys(cleanSectorDetails(sectorDetails)).length
        ? cleanSectorDetails(sectorDetails) as SectorDetails
        : null,
    });
  }

  function onDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === "android") setDateOpen(false);
    if (event.type === "set" && selected) update("loadingDate", dateToInput(selected));
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex} keyboardVerticalOffset={Platform.OS === "ios" ? 96 : 0}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <PageHeader eyebrow={t("freightMarketplace")} title={title} description={description} />
        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t("listingSector")}</Text>
          <View style={styles.sectorChips}>
            {manualSectors.map((item) => (
              <Chip
                key={item}
                label={item === "GENERAL_LOGISTICS" ? t("generalLogistics") : item === "HOME_MOVING" ? t("homeMovingMarketplace") : item === "PARTIAL_LOAD" ? t("partialLoadMarketplace") : t("heavyHaulMarketplace")}
                active={sector === item}
                onPress={() => { if (!sectorLocked) { setSector(item); setSectorDetails({}); setSectorDetailsOpen(item !== "GENERAL_LOGISTICS"); } }}
              />
            ))}
          </View>
          {sectorLocked ? <Text style={[styles.help, { color: theme.muted }]}>{t("sectorSelectionLocked")}</Text> : null}
        </SurfaceCard>
        {sector !== "GENERAL_LOGISTICS" ? <SurfaceCard style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: sectorDetailsOpen }} onPress={() => setSectorDetailsOpen((current) => !current)} style={styles.sectorDetailsHeader}>
            <View style={styles.flex}><Text style={[styles.sectionTitle, { color: theme.text }]}>{sectorFieldCopy(locale, sector).title}</Text><Text style={[styles.help, { color: theme.muted }]}>{sectorFieldCopy(locale, sector).help}</Text></View>
            <Text style={[styles.toggle, { color: theme.primary }]}>{sectorDetailsOpen ? t("hideFields") : t("showFields")}</Text>
          </Pressable>
          {sectorDetailsOpen ? sectorFieldCopy(locale, sector).fields.map(([key, label]) => (
            <TextField key={key} label={label} maxLength={240} value={sectorDetails[key] ?? ""} onChangeText={(value) => setSectorDetails((current) => ({ ...current, [key]: value }))} />
          )) : null}
        </SurfaceCard> : null}

        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t("freightRouteSection")}</Text>
          <FieldError error={errors.origin}><TextField label={t("freightOrigin")} maxLength={160} value={draft.origin} onChangeText={(value) => update("origin", value)} /></FieldError>
          <FieldError error={errors.destination}><TextField label={t("freightDestination")} maxLength={160} value={draft.destination} onChangeText={(value) => update("destination", value)} /></FieldError>
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.text }]}>{t("freightLoadingDate")}</Text>
            <Pressable onPress={() => setDateOpen(true)} style={[styles.dateControl, { backgroundColor: theme.input, borderColor: errors.loadingDate ? theme.danger : theme.border }]}>
              <Text style={[styles.dateText, { color: theme.text }]}>{draft.loadingDate}</Text>
            </Pressable>
            {errors.loadingDate ? <Text style={[styles.errorText, { color: theme.danger }]}>{errors.loadingDate}</Text> : null}
            {dateOpen ? <DateTimePicker minimumDate={new Date()} mode="date" value={new Date(`${draft.loadingDate}T12:00:00`)} onChange={onDateChange} /> : null}
          </View>
        </SurfaceCard>

        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t("freightLoadSection")}</Text>
          <FieldError error={errors.weight}><TextField label={t("freightWeightTonnes")} keyboardType="decimal-pad" maxLength={8} value={draft.weight} onChangeText={(value) => update("weight", value)} /></FieldError>
          <FreightOptionPicker label={t("freightTrailerType")} value={draft.trailerType} placeholder={t("freightSelectTrailer")} options={trailerPickerOptions} open={trailerOpen} onOpen={() => setTrailerOpen(true)} onClose={() => setTrailerOpen(false)} onChange={(value) => update("trailerType", value)} error={errors.trailerType} />
          <FieldError error={errors.vehicleCount}><TextField label={t("freightVehicleCount")} keyboardType="number-pad" maxLength={3} value={draft.vehicleCount} onChangeText={(value) => update("vehicleCount", value)} /></FieldError>
          <TextField label={t("freightCargoTypeOptional")} maxLength={120} value={draft.cargoType} onChangeText={(value) => update("cargoType", value)} />
          <FreightOptionPicker label={t("freightContainerStatus")} value={draft.containerStatus} placeholder={t("freightContainerStatus")} options={containerPickerOptions} open={containerOpen} onOpen={() => setContainerOpen(true)} onClose={() => setContainerOpen(false)} onChange={(value) => update("containerStatus", value)} />
        </SurfaceCard>

        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t("freightCommercialSection")}</Text>
          <FieldError error={errors.priceAmount}><TextField label={t("freightPriceOptional")} keyboardType="decimal-pad" maxLength={14} value={draft.priceAmount} onChangeText={(value) => update("priceAmount", value)} /></FieldError>
          <FreightOptionPicker label={t("freightCurrency")} value={draft.currency} placeholder={t("freightCurrency")} options={currencyPickerOptions} open={currencyOpen} onOpen={() => setCurrencyOpen(true)} onClose={() => setCurrencyOpen(false)} onChange={(value) => update("currency", value)} />
          <TextField label={t("freightCustomsOptional")} maxLength={500} value={draft.customsInfo} onChangeText={(value) => update("customsInfo", value)} />
          <FieldError error={errors.contactPhone}><TextField label={t("freightContactPhone")} keyboardType="phone-pad" maxLength={32} value={draft.contactPhone} onChangeText={(value) => update("contactPhone", value)} /></FieldError>
          <TextField label={t("freightDescriptionOptional")} maxLength={2000} multiline value={draft.description} onChangeText={(value) => update("description", value)} style={styles.multiline} />
        </SurfaceCard>

        {error ? <Text style={[styles.submitError, { backgroundColor: theme.dangerSoft, color: theme.danger }]}>{error}</Text> : null}
        <PrimaryButton title={submitTitle} icon="send-outline" loading={saving} onPress={() => void submit()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FieldError({ error, children }: { error?: string | undefined; children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={styles.field}>{children}{error ? <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text> : null}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { gap: 16, padding: 18, paddingBottom: 40 },
  card: { gap: 14 },
  help: { fontSize: 12, lineHeight: 18 },
  sectorChips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  sectorDetailsHeader: { alignItems: "center", flexDirection: "row", gap: 12 },
  toggle: { fontSize: 12, fontWeight: "900" },
  sectionTitle: { fontSize: 17, fontWeight: "900" },
  field: { gap: 7 },
  label: { fontSize: 13, fontWeight: "800" },
  dateControl: { borderRadius: 14, borderWidth: 1, justifyContent: "center", minHeight: 54, paddingHorizontal: 16 },
  dateText: { fontSize: 16, fontWeight: "700" },
  errorText: { fontSize: 12, fontWeight: "700" },
  multiline: { minHeight: 120, paddingTop: 14, textAlignVertical: "top" },
  submitError: { borderRadius: 14, fontSize: 13, fontWeight: "800", padding: 14 },
});

function cleanSectorDetails(details: Record<string, string>) {
  return Object.fromEntries(Object.entries(details)
    .map(([key, value]) => [key, value.trim()])
    .filter(([, value]) => Boolean(value)));
}
