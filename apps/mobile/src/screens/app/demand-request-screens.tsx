import { MarketplaceContactActions } from "@/features/freight/marketplace-contact-actions";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import {
  createMarketplaceDemandRequest,
  deleteMarketplaceDemandRequest,
  getMarketplaceDemandMatches,
  getMarketplaceDemandRequests,
  markMarketplaceDemandMatchesViewed,
  updateMarketplaceDemandMatchStatus,
  updateMarketplaceDemandRequest,
  updateMarketplaceDemandRequestStatus,
  updateMarketplaceDemandRequestNotifications,
  type DriverEmploymentType,
  type DriverLicenseClass,
  type DriverListingType,
  type FreightTrailerType,
  type LogisticsSector,
  type MarketplaceDemandMatch,
  type MarketplaceDemandRequest,
  type MarketplaceDemandRequestPayload,
  type MarketplaceRequestKind,
  type MarketplaceRequestStatus,
} from "@/api/mobileFreight";
import { FreightOptionPicker } from "@/components/freight-option-picker";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { TextField } from "@/components/text-field";
import { Badge, PageHeader, SurfaceCard } from "@/components/ui";
import { dateToInput, trailerOptions } from "@/features/freight/freight-format";
import { formatDate, formatDateTime } from "@/i18n/format";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { DemandRequestStackParamList } from "@/types/navigation";

type HomeProps = NativeStackScreenProps<DemandRequestStackParamList, "DemandRequestsHome">;
type MatchesProps = NativeStackScreenProps<DemandRequestStackParamList, "DemandRequestMatches">;
type HomeTab = "CREATE" | "MINE";

type Draft = {
  kind: MarketplaceRequestKind;
  title: string;
  keywords: string;
  origin: string;
  destination: string;
  originCountry: string;
  originCity: string;
  originDistrict: string;
  destinationCountry: string;
  destinationCity: string;
  destinationDistrict: string;
  location: string;
  availableFrom: string;
  availableUntil: string;
  trailerType: FreightTrailerType | null;
  vehicleCategory: string;
  vehicleBodyLength: string;
  requiredPlateCountry: string;
  transitRoute: string;
  cargoType: string;
  minWeight: string;
  maxWeight: string;
  driverListingType: DriverListingType | null;
  licenseClasses: DriverLicenseClass[];
  employmentType: DriverEmploymentType | null;
  internationalRequired: boolean;
  adrRequired: boolean;
  notificationsEnabled: boolean;
};

const initialDraft: Draft = {
  kind: "LOAD",
  title: "",
  keywords: "",
  origin: "",
  destination: "",
  originCountry: "",
  originCity: "",
  originDistrict: "",
  destinationCountry: "",
  destinationCity: "",
  destinationDistrict: "",
  location: "",
  availableFrom: "",
  availableUntil: "",
  trailerType: null,
  vehicleCategory: "",
  vehicleBodyLength: "",
  requiredPlateCountry: "",
  transitRoute: "",
  cargoType: "",
  minWeight: "",
  maxWeight: "",
  driverListingType: null,
  licenseClasses: [],
  employmentType: null,
  internationalRequired: false,
  adrRequired: false,
  notificationsEnabled: true,
};

const driverLicenses: DriverLicenseClass[] = ["B", "C", "CE", "D", "DE"];
const employmentTypes: DriverEmploymentType[] = ["FULL_TIME", "PART_TIME", "CONTRACT", "DAILY"];
const demandSectors: LogisticsSector[] = ["GENERAL_LOGISTICS", "HOME_MOVING", "PARTIAL_LOAD", "HEAVY_HAUL"];

export function DemandRequestsScreen({ navigation, route }: HomeProps) {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const [tab, setTab] = useState<HomeTab>("CREATE");
  const [requests, setRequests] = useState<MarketplaceDemandRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MarketplaceDemandRequest | null>(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const response = await getMarketplaceDemandRequests(undefined, route.params?.scope);
      setRequests(response.requests);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("demandRequestsLoadFailed"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [route.params?.scope, t]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  async function changeStatus(item: MarketplaceDemandRequest, status: "ACTIVE" | "PAUSED" | "FULFILLED") {
    try {
      const response = await updateMarketplaceDemandRequestStatus(item.id, status);
      setRequests((current) => current.map((request) => request.id === item.id ? response.request : request));
    } catch (statusError) {
      Alert.alert(t("demandCenter"), statusError instanceof Error ? statusError.message : t("demandRequestUpdateFailed"));
    }
  }

  async function changeNotifications(item: MarketplaceDemandRequest, notificationsEnabled: boolean) {
    try {
      const response = await updateMarketplaceDemandRequestNotifications(item.id, notificationsEnabled);
      setRequests((current) => current.map((request) => request.id === item.id ? response.request : request));
    } catch (updateError) {
      Alert.alert(t("demandCenter"), updateError instanceof Error ? updateError.message : t("demandRequestUpdateFailed"));
    }
  }

  function remove(item: MarketplaceDemandRequest) {
    Alert.alert(t("deleteDemand"), t("deleteDemandConfirm"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("deleteDemand"), style: "destructive", onPress: () => void deleteMarketplaceDemandRequest(item.id).then(() => setRequests((current) => current.filter((request) => request.id !== item.id))).catch((deleteError) => Alert.alert(t("demandCenter"), deleteError instanceof Error ? deleteError.message : t("demandRequestUpdateFailed"))) },
    ]);
  }

  return (
    <Screen style={styles.screen}>
      <View style={[styles.tabBar, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
        <Segment label={t("createDemandRequest")} active={tab === "CREATE"} onPress={() => { setEditing(null); setTab("CREATE"); }} />
        <Segment label={t("myDemandRequests")} active={tab === "MINE"} onPress={() => { setEditing(null); setTab("MINE"); }} />
      </View>
      {tab === "CREATE" ? (
        <DemandRequestForm defaultSector={route.params?.sector} editing={editing} onCancelEdit={() => { setEditing(null); setTab("MINE"); }} onSaved={async () => {
          const wasEditing = Boolean(editing);
          await load(true);
          setEditing(null);
          setTab("MINE");
          Alert.alert(
            wasEditing ? t("demandRequestUpdatedTitle") : t("demandRequestCreatedTitle"),
            wasEditing ? t("demandRequestUpdatedDescription") : t("smartMatchingStartedDescription"),
          );
        }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.primary} />}
        >
          <PageHeader
            eyebrow={t("logisticsMarketplace")}
            title={t("myDemandRequests")}
            description={t("myDemandRequestsDescription")}
          />
          {loading && requests.length === 0 ? <ActivityIndicator color={theme.primary} size="large" /> : null}
          {error && requests.length === 0 ? <ErrorState title={error} onRetry={() => void load()} /> : null}
          {!loading && !error && requests.length === 0 ? (
            <EmptyState title={t("noDemandRequests")} description={t("noDemandRequestsDescription")} />
          ) : null}
          {requests.map((item) => (
            <DemandRequestCard
              key={item.id}
              item={item}
              locale={locale}
              onOpenMatches={() => navigation.navigate("DemandRequestMatches", { requestId: item.id, requestTitle: item.title })}
              onStatusChange={(status) => void changeStatus(item, status)}
              onNotificationsChange={(enabled) => void changeNotifications(item, enabled)}
              onEdit={() => { setEditing(item); setTab("CREATE"); }}
              onDelete={() => remove(item)}
            />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

function DemandRequestForm({ defaultSector, editing, onSaved, onCancelEdit }: { defaultSector?: MarketplaceDemandRequestPayload["primarySector"]; editing: MarketplaceDemandRequest | null; onSaved: () => Promise<void>; onCancelEdit: () => void }) {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const [draft, setDraft] = useState(initialDraft);
  const [sector, setSector] = useState<LogisticsSector>(defaultSector ?? "GENERAL_LOGISTICS");
  const [sectorCriteria, setSectorCriteria] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [employmentOpen, setEmploymentOpen] = useState(false);
  const [datePicker, setDatePicker] = useState<"FROM" | "UNTIL" | null>(null);
  const requestId = useRef(Crypto.randomUUID());
  const trailerPickerOptions = useMemo(() => trailerOptions.map((option) => ({ value: option.value, label: t(option.labelKey) })), [t]);
  const employmentOptions = useMemo(() => employmentTypes.map((value) => ({ value, label: t(`driverEmployment${value}`) })), [t]);

  useEffect(() => {
    setDraft(editing ? draftFromRequest(editing) : initialDraft);
    setSector(editing?.primarySector ?? defaultSector ?? "GENERAL_LOGISTICS");
    setSectorCriteria(stringCriteria(editing?.sectorCriteria));
    requestId.current = Crypto.randomUUID();
  }, [defaultSector, editing]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function selectKind(kind: MarketplaceRequestKind) {
    setDraft((current) => ({
      ...initialDraft,
      kind,
      title: current.title,
      keywords: current.keywords,
    }));
  }

  function onDateChange(event: DateTimePickerEvent, selected?: Date) {
    const target = datePicker;
    if (Platform.OS === "android") setDatePicker(null);
    if (event.type === "set" && selected && target) update(target === "FROM" ? "availableFrom" : "availableUntil", dateToInput(selected));
  }

  async function submit() {
    if (draft.title.trim().length < 3) {
      Alert.alert(t("createDemandRequest"), t("demandRequestTitleRequired"));
      return;
    }
    const keywords = draft.keywords.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 5);
    const minWeight = draft.minWeight.trim() ? Number(draft.minWeight.replace(",", ".")) : null;
    const maxWeight = draft.maxWeight.trim() ? Number(draft.maxWeight.replace(",", ".")) : null;
    const vehicleBodyLength = draft.vehicleBodyLength.trim() ? Number(draft.vehicleBodyLength.replace(",", ".")) : null;
    if (vehicleBodyLength != null && (!Number.isFinite(vehicleBodyLength) || vehicleBodyLength <= 0 || vehicleBodyLength > 40)) {
      Alert.alert(t("createDemandRequest"), t("demandVehicleBodyLengthInvalid"));
      return;
    }
    const origin = joinLocation(draft.originCountry, draft.originCity, draft.originDistrict) || draft.origin.trim() || null;
    const destination = joinLocation(draft.destinationCountry, draft.destinationCity, draft.destinationDistrict) || draft.destination.trim() || null;
    const normalizedSectorCriteria = cleanCriteria(sectorCriteria);
    const hasSectorCriteria = Boolean(normalizedSectorCriteria);
    const hasRouteCriteria = Boolean(origin || destination || draft.trailerType || draft.vehicleCategory.trim() || draft.requiredPlateCountry.trim() || draft.transitRoute.trim() || draft.cargoType.trim() || draft.availableFrom || draft.availableUntil || minWeight || maxWeight || vehicleBodyLength || keywords.length || hasSectorCriteria);
    const hasDriverCriteria = Boolean(draft.location.trim() || draft.availableFrom || draft.availableUntil || draft.driverListingType || draft.licenseClasses.length || draft.employmentType || draft.internationalRequired || draft.adrRequired || keywords.length || hasSectorCriteria);
    if ((draft.kind === "DRIVER" ? !hasDriverCriteria : !hasRouteCriteria)) {
      Alert.alert(t("createDemandRequest"), t("demandRequestCriteriaRequired"));
      return;
    }
    if (draft.availableFrom && draft.availableUntil && draft.availableUntil < draft.availableFrom) {
      Alert.alert(t("createDemandRequest"), t("marketplaceDateRangeInvalid"));
      return;
    }
    if (minWeight != null && maxWeight != null && minWeight > maxWeight) {
      Alert.alert(t("createDemandRequest"), t("freightWeightRangeInvalid"));
      return;
    }

    const payload: MarketplaceDemandRequestPayload = {
      kind: draft.kind,
      title: draft.title.trim(),
      primarySector: sector,
      sectorCriteria: normalizedSectorCriteria,
      keywords,
      origin: draft.kind === "DRIVER" ? null : origin,
      destination: draft.kind === "DRIVER" ? null : destination,
      originCountry: draft.kind === "DRIVER" ? null : draft.originCountry.trim() || null,
      originCity: draft.kind === "DRIVER" ? null : draft.originCity.trim() || null,
      originDistrict: draft.kind === "DRIVER" ? null : draft.originDistrict.trim() || null,
      destinationCountry: draft.kind === "DRIVER" ? null : draft.destinationCountry.trim() || null,
      destinationCity: draft.kind === "DRIVER" ? null : draft.destinationCity.trim() || null,
      destinationDistrict: draft.kind === "DRIVER" ? null : draft.destinationDistrict.trim() || null,
      location: draft.kind === "DRIVER" ? draft.location.trim() || null : null,
      availableFrom: draft.availableFrom || null,
      availableUntil: draft.availableUntil || null,
      trailerType: draft.kind === "DRIVER" ? null : draft.trailerType,
      vehicleCategory: draft.kind === "DRIVER" ? null : draft.vehicleCategory.trim() || null,
      vehicleBodyLength: draft.kind === "DRIVER" ? null : vehicleBodyLength,
      requiredPlateCountry: draft.kind === "DRIVER" ? null : draft.requiredPlateCountry.trim() || null,
      transitRoute: draft.kind === "DRIVER" ? null : draft.transitRoute.trim() || null,
      cargoType: draft.kind === "DRIVER" ? null : draft.cargoType.trim() || null,
      minWeight: draft.kind === "DRIVER" ? null : minWeight,
      maxWeight: draft.kind === "DRIVER" ? null : maxWeight,
      driverListingType: draft.kind === "DRIVER" ? draft.driverListingType : null,
      licenseClasses: draft.kind === "DRIVER" ? draft.licenseClasses : [],
      employmentType: draft.kind === "DRIVER" ? draft.employmentType : null,
      internationalRequired: draft.kind === "LOAD" ? false : draft.internationalRequired,
      adrRequired: draft.kind === "LOAD" ? false : draft.adrRequired,
      notificationsEnabled: draft.notificationsEnabled,
      expiresInDays: 30,
      clientRequestId: requestId.current,
    };
    setSaving(true);
    try {
      if (editing) {
        const { clientRequestId: _clientRequestId, ...updatePayload } = payload;
        await updateMarketplaceDemandRequest(editing.id, updatePayload);
      } else {
        await createMarketplaceDemandRequest(payload);
      }
      requestId.current = Crypto.randomUUID();
      setDraft(initialDraft);
      await onSaved();
    } catch (submitError) {
      Alert.alert(t("createDemandRequest"), submitError instanceof Error ? submitError.message : t("demandRequestCreateFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <PageHeader
        eyebrow={t("logisticsMarketplace")}
        title={editing ? `${t("edit")}: ${editing.title}` : t("createDemandRequest")}
        description={t("createDemandRequestDescription")}
      />
      <SurfaceCard style={styles.formCard}>
        <FormSection
          title={t("logisticsSector")}
          description={t("logisticsSectorDemandDescription")}
        />
        <View style={styles.wrapRow}>
          {demandSectors.map((value) => (
            <ChoiceChip
              key={value}
              label={sectorLabel(value, locale)}
              active={sector === value}
              onPress={() => {
                if (defaultSector) return;
                setSector(value);
                setSectorCriteria({});
              }}
            />
          ))}
        </View>
        {sector !== "GENERAL_LOGISTICS" ? (
          <View style={styles.sectorCriteria}>
            {demandSectorFields(sector, locale).map(([key, label]) => (
              <TextField
                key={key}
                label={label}
                maxLength={240}
                value={sectorCriteria[key] ?? ""}
                onChangeText={(value) =>
                  setSectorCriteria((current) => ({ ...current, [key]: value }))
                }
              />
            ))}
          </View>
        ) : null}
      </SurfaceCard>
      <SurfaceCard style={styles.formCard}>
        <FormSection title={t("whatDoYouNeed")} description={t("demandKindDescription")} />
        <View style={styles.kindRow}>
          <KindButton icon="cube-outline" label={t("load")} active={draft.kind === "LOAD"} onPress={() => selectKind("LOAD")} />
          <KindButton icon="bus-outline" label={t("vehicle")} active={draft.kind === "VEHICLE"} onPress={() => selectKind("VEHICLE")} />
          <KindButton icon="person-outline" label={t("driver")} active={draft.kind === "DRIVER"} onPress={() => selectKind("DRIVER")} />
        </View>
        <TextField label={t("demandRequestTitle")} maxLength={140} value={draft.title} onChangeText={(value) => update("title", value)} placeholder={t("demandRequestTitlePlaceholder")} />
        <TextField label={t("demandKeywordsOptional")} maxLength={220} value={draft.keywords} onChangeText={(value) => update("keywords", value)} placeholder={t("demandKeywordsPlaceholder")} />
      </SurfaceCard>

      {draft.kind !== "DRIVER" ? (
        <SurfaceCard style={styles.formCard}>
          <FormSection title={t("routeAndCapacity")} description={t("routeAndCapacityDescription")} />
          <Text style={[styles.fieldLabel, { color: theme.text }]}>{t("fromOptional")}</Text>
          <View style={styles.twoColumns}>
            <View style={styles.column}><TextField label={t("country")} maxLength={80} value={draft.originCountry} onChangeText={(value) => update("originCountry", value)} placeholder={t("countryPlaceholder")} /></View>
            <View style={styles.column}><TextField label={t("cityOrRegion")} maxLength={120} value={draft.originCity} onChangeText={(value) => update("originCity", value)} placeholder={t("cityOrRegion")} /></View>
            <View style={styles.column}><TextField label={t("district")} maxLength={120} value={draft.originDistrict} onChangeText={(value) => update("originDistrict", value)} placeholder={t("districtPlaceholder")} /></View>
          </View>
          <Text style={[styles.fieldLabel, { color: theme.text }]}>{t("toOptional")}</Text>
          <View style={styles.twoColumns}>
            <View style={styles.column}><TextField label={t("country")} maxLength={80} value={draft.destinationCountry} onChangeText={(value) => update("destinationCountry", value)} placeholder={t("countryPlaceholder")} /></View>
            <View style={styles.column}><TextField label={t("cityOrRegion")} maxLength={120} value={draft.destinationCity} onChangeText={(value) => update("destinationCity", value)} placeholder={t("cityOrRegion")} /></View>
            <View style={styles.column}><TextField label={t("district")} maxLength={120} value={draft.destinationDistrict} onChangeText={(value) => update("destinationDistrict", value)} placeholder={t("districtPlaceholder")} /></View>
          </View>
          <FreightOptionPicker
            label={t("freightTrailerTypeOptional")}
            value={draft.trailerType}
            placeholder={t("allTrailerTypes")}
            options={trailerPickerOptions}
            open={trailerOpen}
            onOpen={() => setTrailerOpen(true)}
            onClose={() => setTrailerOpen(false)}
            onChange={(value) => update("trailerType", value)}
          />
          {draft.trailerType ? <ClearButton label={t("clearTrailerSelection")} onPress={() => update("trailerType", null)} /> : null}
          <View style={styles.twoColumns}>
            <View style={styles.column}><TextField label={t("demandVehicleCategoryOptional")} maxLength={80} value={draft.vehicleCategory} onChangeText={(value) => update("vehicleCategory", value)} /></View>
            <View style={styles.column}><TextField label={t("demandVehicleBodyLengthOptional")} keyboardType="decimal-pad" value={draft.vehicleBodyLength} onChangeText={(value) => update("vehicleBodyLength", value)} /></View>
          </View>
          <TextField label={t("demandRequiredPlateCountryOptional")} maxLength={80} value={draft.requiredPlateCountry} onChangeText={(value) => update("requiredPlateCountry", value)} />
          <TextField label={t("demandTransitRouteOptional")} maxLength={500} value={draft.transitRoute} onChangeText={(value) => update("transitRoute", value)} />
          <TextField label={t("freightCargoTypeOptional")} maxLength={120} value={draft.cargoType} onChangeText={(value) => update("cargoType", value)} />
          <View style={styles.twoColumns}>
            <View style={styles.column}><TextField label={t("minimumWeightOptional")} keyboardType="decimal-pad" value={draft.minWeight} onChangeText={(value) => update("minWeight", value)} /></View>
            <View style={styles.column}><TextField label={t("maximumWeightOptional")} keyboardType="decimal-pad" value={draft.maxWeight} onChangeText={(value) => update("maxWeight", value)} /></View>
          </View>
          {draft.kind === "VEHICLE" ? (
            <>
              <SwitchRow label={t("internationalTransportRequired")} description={t("internationalTransportRequiredDescription")} value={draft.internationalRequired} onChange={(value) => update("internationalRequired", value)} />
              <SwitchRow label={t("adrRequired")} description={t("adrRequiredDescription")} value={draft.adrRequired} onChange={(value) => update("adrRequired", value)} />
            </>
          ) : null}
        </SurfaceCard>
      ) : (
        <SurfaceCard style={styles.formCard}>
          <FormSection title={t("driverCriteria")} description={t("driverCriteriaDescription")} />
          <TextField label={t("driverLocationOptional")} maxLength={160} value={draft.location} onChangeText={(value) => update("location", value)} placeholder={t("cityOrRegion")} />
          <Text style={[styles.fieldLabel, { color: theme.text }]}>{t("matchingDriverListingType")}</Text>
          <View style={styles.wrapRow}>
            <ChoiceChip label={t("driverAvailable")} active={draft.driverListingType === "DRIVER_AVAILABLE"} onPress={() => update("driverListingType", draft.driverListingType === "DRIVER_AVAILABLE" ? null : "DRIVER_AVAILABLE")} />
            <ChoiceChip label={t("driverWanted")} active={draft.driverListingType === "DRIVER_WANTED"} onPress={() => update("driverListingType", draft.driverListingType === "DRIVER_WANTED" ? null : "DRIVER_WANTED")} />
          </View>
          <Text style={[styles.fieldLabel, { color: theme.text }]}>{t("driverLicenseClassesOptional")}</Text>
          <View style={styles.wrapRow}>
            {driverLicenses.map((license) => <ChoiceChip key={license} label={license} active={draft.licenseClasses.includes(license)} onPress={() => update("licenseClasses", draft.licenseClasses.includes(license) ? draft.licenseClasses.filter((item) => item !== license) : [...draft.licenseClasses, license])} />)}
          </View>
          <FreightOptionPicker
            label={t("driverEmploymentTypeOptional")}
            value={draft.employmentType}
            placeholder={t("allEmploymentTypes")}
            options={employmentOptions}
            open={employmentOpen}
            onOpen={() => setEmploymentOpen(true)}
            onClose={() => setEmploymentOpen(false)}
            onChange={(value) => update("employmentType", value)}
          />
          {draft.employmentType ? <ClearButton label={t("clearEmploymentSelection")} onPress={() => update("employmentType", null)} /> : null}
          <SwitchRow label={t("internationalExperienceRequired")} description={t("internationalExperienceRequiredDescription")} value={draft.internationalRequired} onChange={(value) => update("internationalRequired", value)} />
          <SwitchRow label={t("adrRequired")} description={t("driverAdrRequiredDescription")} value={draft.adrRequired} onChange={(value) => update("adrRequired", value)} />
        </SurfaceCard>
      )}

      <SurfaceCard style={styles.formCard}>
        <FormSection title={t("demandDateRange")} description={t("demandDateRangeDescription")} />
        <View style={styles.twoColumns}>
          <View style={styles.column}><DateField label={t("availableFromOptional")} value={draft.availableFrom} onPress={() => setDatePicker("FROM")} onClear={() => update("availableFrom", "")} /></View>
          <View style={styles.column}><DateField label={t("availableUntilOptional")} value={draft.availableUntil} onPress={() => setDatePicker("UNTIL")} onClear={() => update("availableUntil", "")} /></View>
        </View>
        {datePicker ? (
          <DateTimePicker
            mode="date"
            minimumDate={new Date()}
            value={new Date(`${(datePicker === "FROM" ? draft.availableFrom : draft.availableUntil) || dateToInput(new Date())}T12:00:00`)}
            onChange={onDateChange}
          />
        ) : null}
        {Platform.OS === "ios" && datePicker ? <ClearButton label={t("done")} onPress={() => setDatePicker(null)} /> : null}
        <SwitchRow label={t("demandNotifications")} description={t("demandNotificationsDescription")} value={draft.notificationsEnabled} onChange={(value) => update("notificationsEnabled", value)} />
        <Text style={[styles.helper, { color: theme.muted }]}>{t("demandExpiryNotice")}</Text>
      </SurfaceCard>

      <PrimaryButton title={editing ? t("saveChanges") : t("activateDemandRequest")} icon={editing ? "save-outline" : "notifications-outline"} loading={saving} onPress={() => void submit()} />
      {editing ? <ClearButton label={t("cancel")} onPress={onCancelEdit} /> : null}
    </ScrollView>
  );
}

function DemandRequestCard({ item, locale, onOpenMatches, onStatusChange, onNotificationsChange, onEdit, onDelete }: {
  item: MarketplaceDemandRequest;
  locale: string;
  onOpenMatches: () => void;
  onStatusChange: (status: "ACTIVE" | "PAUSED" | "FULFILLED") => void;
  onNotificationsChange: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <SurfaceCard style={styles.requestCard}>
      <View style={styles.requestTop}>
        <View style={[styles.kindIcon, { backgroundColor: theme.badge }]}>
          <Ionicons name={item.kind === "LOAD" ? "cube-outline" : item.kind === "VEHICLE" ? "bus-outline" : "person-outline"} size={23} color={theme.primary} />
        </View>
        <View style={styles.flexText}>
          <Text style={[styles.requestTitle, { color: theme.text }]}>{item.title}</Text>
          <Text style={[styles.requestMeta, { color: theme.muted }]}>{t(`demandKind${item.kind}`)} · {formatDate(item.expiresAt, locale)}</Text>
        </View>
        <Badge label={t(`demandStatus${item.status}`)} tone={item.status === "ACTIVE" ? "success" : item.status === "PAUSED" ? "warning" : "default"} />
      </View>
      <Pressable accessibilityRole="button" onPress={onOpenMatches} style={[styles.matchSummary, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
        <View>
          <Text style={[styles.matchCount, { color: theme.text }]}>{item.matchCount}</Text>
          <Text style={[styles.matchLabel, { color: theme.muted }]}>{t("matchingListings")}</Text>
        </View>
        <View style={styles.openMatches}>
          <Text style={[styles.openMatchesText, { color: theme.primary }]}>{t("viewMatches")}</Text>
          <Ionicons name="chevron-forward" size={20} color={theme.primary} />
        </View>
      </Pressable>
      {item.smartMatching ? (
        <View style={[styles.smartProgress, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
          <View style={styles.requestTop}>
            <Ionicons name={item.smartMatching.status === "RUNNING" || item.smartMatching.status === "QUEUED" ? "sync-outline" : "sparkles-outline"} size={20} color={theme.primary} />
            <View style={styles.flexText}>
              <Text style={[styles.smartProgressTitle, { color: theme.text }]}>{t("smartMatchingTitle")}</Text>
              <Text style={[styles.requestMeta, { color: theme.muted }]}>{t(`smartMatchingStatus${item.smartMatching.status}`)}</Text>
            </View>
          </View>
          <View style={styles.progressSources}>
            {item.smartMatching.requestedSources.map((source) => (
              <View key={source} style={styles.progressSource}>
                <Ionicons name={item.smartMatching?.completedSources.includes(source) ? "checkmark-circle" : "ellipse-outline"} size={16} color={item.smartMatching?.completedSources.includes(source) ? theme.success : theme.iconMuted} />
                <Text style={[styles.progressSourceText, { color: theme.muted }]}>{t(`matchSource${source}`)}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.requestMeta, { color: theme.muted }]}>{t("smartMatchingProgressCounts", { groups: item.smartMatching.groupsProcessed, messages: item.smartMatching.messagesAnalyzed, matches: item.smartMatching.matchesFound })}</Text>
        </View>
      ) : null}
      <SwitchRow label={t("demandNotifications")} description={t("demandNotificationsDescription")} value={item.notificationsEnabled} onChange={onNotificationsChange} />
      <View style={styles.actionRow}>
        <SmallAction label={t("edit")} onPress={onEdit} />
        {item.status === "ACTIVE" ? <SmallAction label={t("pauseDemand")} onPress={() => onStatusChange("PAUSED")} /> : null}
        {item.status === "PAUSED" ? <SmallAction label={t("reactivateDemand")} onPress={() => onStatusChange("ACTIVE")} /> : null}
        {item.status === "ACTIVE" || item.status === "PAUSED" ? <SmallAction label={t("completeDemand")} onPress={() => onStatusChange("FULFILLED")} /> : null}
        <SmallAction label={t("deleteDemand")} onPress={onDelete} />
      </View>
    </SurfaceCard>
  );
}

export function DemandRequestMatchesScreen({ navigation, route }: MatchesProps) {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const [matches, setMatches] = useState<MarketplaceDemandMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const response = await getMarketplaceDemandMatches(route.params.requestId);
      setMatches(response.matches);
      await markMarketplaceDemandMatchesViewed(route.params.requestId).catch(() => undefined);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("demandMatchesLoadFailed"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [route.params.requestId, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function changeMatchStatus(match: MarketplaceDemandMatch, status: "SAVED" | "DISMISSED") {
    try {
      await updateMarketplaceDemandMatchStatus(route.params.requestId, match.id, status);
      setMatches((current) => status === "DISMISSED"
        ? current.filter((item) => item.id !== match.id)
        : current.map((item) => item.id === match.id ? { ...item, status } : item));
    } catch (statusError) {
      Alert.alert(t("demandCenter"), statusError instanceof Error ? statusError.message : t("demandMatchStatusUpdateFailed"));
    }
  }

  function openListingDetails(match: MarketplaceDemandMatch) {
    const parent = navigation.getParent();
    if (match.listingKind === "LOAD") {
      parent?.navigate("FindLoads", { screen: "FreightDetails", params: { listingId: match.listingId, requestId: route.params.requestId } });
    } else if (match.listingKind === "VEHICLE") {
      parent?.navigate("VehicleMarketplace", { screen: "VehicleDetails", params: { listingId: match.listingId, requestId: route.params.requestId } });
    } else {
      parent?.navigate("DriverMarketplace", { screen: "DriverDetails", params: { listingId: match.listingId, requestId: route.params.requestId } });
    }
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.primary} />}>
        <BackButton onPress={() => navigation.goBack()} />
        <PageHeader eyebrow={t("demandCenter")} title={route.params.requestTitle || t("matchingListings")} description={t("demandMatchesDescription")} />
        {loading && matches.length === 0 ? <ActivityIndicator color={theme.primary} size="large" /> : null}
        {error && matches.length === 0 ? <ErrorState title={error} onRetry={() => void load()} /> : null}
        {!loading && !error && matches.length === 0 ? <EmptyState title={t("noDemandMatches")} description={t("noDemandMatchesDescription")} /> : null}
        {matches.map((match) => (
          <SurfaceCard key={match.id} style={styles.matchCard}>
            <View style={styles.requestTop}>
              <View style={[styles.kindIcon, { backgroundColor: theme.badge }]}><Ionicons name={match.listingKind === "LOAD" ? "cube-outline" : match.listingKind === "VEHICLE" ? "bus-outline" : "person-outline"} size={23} color={theme.primary} /></View>
               <View style={styles.flexText}>
                 <Text style={[styles.requestTitle, { color: theme.text }]}>{match.listing.title}</Text>
                 <Text style={[styles.requestMeta, { color: theme.muted }]}>{t(`matchSource${match.sourcePlatform}`)} · {match.listing.companyName}</Text>
               </View>
              <Badge label={t("matchScore", { count: match.score })} tone="success" />
            </View>
             <Text style={[styles.matchDetail, { color: theme.text }]}>{match.listing.detail}</Text>
             {match.sourceCount > 1 ? <Text style={[styles.requestMeta, { color: theme.primary }]}>{t("foundInMultipleSources", { count: match.sourceCount })}</Text> : null}
             {match.provenance.slice(0, 3).map((source) => <Text key={`${source.platform}:${source.sourceMessageId ?? source.groupName}`} style={[styles.requestMeta, { color: theme.muted }]}>• {t(`matchSource${source.platform}`)} / {source.groupName}</Text>)}
             <Text style={[styles.requestMeta, { color: theme.muted }]}>{match.listing.date ? formatDate(`${match.listing.date}T12:00:00`, locale) : ""} · {formatDateTime(match.matchedAt, locale)}</Text>
             {match.sourcePlatform === "LOGIVYA" ? <PrimaryButton
               title={t("viewDetails")}
               icon="open-outline"
               onPress={() => openListingDetails(match)}
             /> : null}
             <MarketplaceContactActions
               contactAccess={match.listing.contactAccess}
               phone={match.listing.contactPhone}
               telegramHref={match.listing.telegramHref}
               canCall={Boolean(match.listing.canCall)}
               canOpenWhatsApp={Boolean(match.listing.canOpenWhatsApp)}
               whatsappPrefilledMessage={match.listing.whatsappPrefilledMessage ?? null}
             />
             <View style={styles.actionRow}>
               {match.sourcePlatform !== "LOGIVYA" && match.status !== "SAVED" ? <SmallAction label={t("saveMatch")} onPress={() => void changeMatchStatus(match, "SAVED")} /> : null}
               <SmallAction label={t("dismissMatch")} onPress={() => void changeMatchStatus(match, "DISMISSED")} />
             </View>
          </SurfaceCard>
        ))}
      </ScrollView>
    </Screen>
  );
}

function draftFromRequest(request: MarketplaceDemandRequest): Draft {
  return {
    kind: request.kind,
    title: request.title,
    keywords: request.keywords.join(", "),
    origin: request.origin || "",
    destination: request.destination || "",
    originCountry: request.originCountry || "",
    originCity: request.originCity || "",
    originDistrict: request.originDistrict || "",
    destinationCountry: request.destinationCountry || "",
    destinationCity: request.destinationCity || "",
    destinationDistrict: request.destinationDistrict || "",
    location: request.location || "",
    availableFrom: request.availableFrom?.slice(0, 10) || "",
    availableUntil: request.availableUntil?.slice(0, 10) || "",
    trailerType: request.trailerType || null,
    vehicleCategory: request.vehicleCategory || "",
    vehicleBodyLength: request.vehicleBodyLength == null ? "" : String(request.vehicleBodyLength),
    requiredPlateCountry: request.requiredPlateCountry || "",
    transitRoute: request.transitRoute || "",
    cargoType: request.cargoType || "",
    minWeight: request.minWeight == null ? "" : String(request.minWeight),
    maxWeight: request.maxWeight == null ? "" : String(request.maxWeight),
    driverListingType: request.driverListingType || null,
    licenseClasses: request.licenseClasses,
    employmentType: request.employmentType || null,
    internationalRequired: request.internationalRequired,
    adrRequired: request.adrRequired,
    notificationsEnabled: request.notificationsEnabled,
  };
}

function joinLocation(country: string, city: string, district: string) {
  return [country.trim(), city.trim(), district.trim()].filter(Boolean).join(", ");
}

function Segment({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.segment, { backgroundColor: active ? theme.primary : "transparent" }]}><Text style={[styles.segmentText, { color: active ? theme.primaryText : theme.text }]}>{label}</Text></Pressable>;
}

function KindButton({ icon, label, active, onPress }: { icon: "cube-outline" | "bus-outline" | "person-outline"; label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.kindButton, { backgroundColor: active ? theme.badge : theme.cardMuted, borderColor: active ? theme.primary : theme.border }]}><Ionicons name={icon} size={22} color={active ? theme.primary : theme.iconMuted} /><Text style={[styles.kindButtonText, { color: theme.text }]}>{label}</Text></Pressable>;
}

function ChoiceChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.choiceChip, { backgroundColor: active ? theme.primary : theme.cardMuted, borderColor: active ? theme.primary : theme.border }]}><Text style={[styles.choiceChipText, { color: active ? theme.primaryText : theme.text }]}>{label}</Text></Pressable>;
}

function FormSection({ title, description }: { title: string; description: string }) {
  const theme = useTheme();
  return <View style={styles.formHeading}><Text style={[styles.formTitle, { color: theme.text }]}>{title}</Text><Text style={[styles.formDescription, { color: theme.muted }]}>{description}</Text></View>;
}

function SwitchRow({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (value: boolean) => void }) {
  const theme = useTheme();
  return <View style={[styles.switchRow, { borderColor: theme.border }]}><View style={styles.flexText}><Text style={[styles.switchLabel, { color: theme.text }]}>{label}</Text><Text style={[styles.switchDescription, { color: theme.muted }]}>{description}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: theme.border, true: theme.primary }} thumbColor={value ? theme.primaryText : theme.muted} /></View>;
}

function DateField({ label, value, onPress, onClear }: { label: string; value: string; onPress: () => void; onClear: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  return <View style={styles.dateField}><Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text><Pressable accessibilityRole="button" onPress={onPress} style={[styles.dateControl, { backgroundColor: theme.input, borderColor: theme.border }]}><Ionicons name="calendar-outline" size={19} color={theme.iconMuted} /><Text style={[styles.dateValue, { color: value ? theme.text : theme.muted }]}>{value || t("anyDate")}</Text></Pressable>{value ? <ClearButton label={t("clearDate")} onPress={onClear} /> : null}</View>;
}

function ClearButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.clearButton}><Ionicons name="close-circle-outline" size={17} color={theme.primary} /><Text style={[styles.clearText, { color: theme.primary }]}>{label}</Text></Pressable>;
}

function SmallAction({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.smallAction, { borderColor: theme.border }]}><Text style={[styles.smallActionText, { color: theme.text }]}>{label}</Text></Pressable>;
}

function BackButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  return <Pressable accessibilityRole="button" accessibilityLabel={t("back")} onPress={onPress} style={[styles.backButton, { backgroundColor: theme.card, borderColor: theme.border }]}><Ionicons name="arrow-back" size={21} color={theme.text} /></Pressable>;
}

function stringCriteria(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => ["string", "number", "boolean"].includes(typeof item))
      .map(([key, item]) => [key, String(item)]),
  );
}

function cleanCriteria(value: Record<string, string>) {
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

function demandSectorFields(
  sector: LogisticsSector,
  locale: string,
): Array<[string, string]> {
  const copy = (tr: string, en: string, ar: string) => locale === "tr" ? tr : locale === "ar" ? ar : en;
  if (sector === "HOME_MOVING") return [
    ["moveType", copy("Ev, ofis veya parça eşya", "Home, office, or partial household items", "منزل أو مكتب أو أثاث جزئي")],
    ["roomCount", copy("Oda sayısı", "Room count", "عدد الغرف")],
    ["pickupFloor", copy("Alış katı", "Pickup floor", "طابق الاستلام")],
    ["deliveryFloor", copy("Teslim katı", "Delivery floor", "طابق التسليم")],
    ["elevator", copy("Asansör ihtiyacı", "Elevator requirement", "الحاجة إلى مصعد")],
    ["packing", copy("Paketleme ihtiyacı", "Packing requirement", "الحاجة إلى تغليف")],
    ["assembly", copy("Montaj ihtiyacı", "Assembly requirement", "الحاجة إلى تركيب")],
    ["vehicleRequirement", copy("Araç ihtiyacı", "Vehicle requirement", "متطلبات المركبة")],
    ["crewRequirement", copy("Ekip ihtiyacı", "Crew requirement", "متطلبات الطاقم")],
  ];
  if (sector === "PARTIAL_LOAD") return [
    ["volumeRange", copy("Hacim aralığı (m³)", "Volume range (m³)", "نطاق الحجم (م³)")],
    ["palletCount", copy("Palet sayısı", "Pallet count", "عدد المنصات")],
    ["packageCount", copy("Koli veya paket sayısı", "Box or package count", "عدد الصناديق أو الطرود")],
    ["temperatureRequirement", copy("Sıcaklık gereksinimi", "Temperature requirement", "متطلبات درجة الحرارة")],
    ["hazardousStatus", copy("Tehlikeli madde durumu", "Hazardous-goods status", "حالة المواد الخطرة")],
    ["deliveryMode", copy("Terminal, depo veya kapı teslim", "Terminal, warehouse, or door delivery", "التسليم في المحطة أو المستودع أو الباب")],
  ];
  if (sector === "HEAVY_HAUL") return [
    ["machineryType", copy("Makine veya yük türü", "Machinery or cargo type", "نوع الآلة أو الحمولة")],
    ["dimensions", copy("Boyutlar", "Dimensions", "الأبعاد")],
    ["lowbedType", copy("Lowbed tipi", "Lowbed type", "نوع المقطورة المنخفضة")],
    ["permitRequired", copy("İzin gereksinimi", "Permit requirement", "متطلبات التصريح")],
    ["escortRequired", copy("Eskort gereksinimi", "Escort requirement", "متطلبات المرافقة")],
    ["craneRequired", copy("Vinç gereksinimi", "Crane requirement", "متطلبات الرافعة")],
  ];
  return [];
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingTop: 0 },
  scroll: { gap: 16, padding: 18, paddingBottom: 44 },
  tabBar: { borderBottomWidth: 1, flexDirection: "row", gap: 6, padding: 8 },
  segment: { alignItems: "center", borderRadius: 13, flex: 1, justifyContent: "center", minHeight: 46, paddingHorizontal: 10 },
  segmentText: { fontSize: 14, fontWeight: "900" },
  formCard: { gap: 16 },
  sectorCriteria: { gap: 12 },
  formHeading: { gap: 5 },
  formTitle: { fontSize: 19, fontWeight: "900" },
  formDescription: { fontSize: 13, lineHeight: 19 },
  kindRow: { flexDirection: "row", gap: 8 },
  kindButton: { alignItems: "center", borderRadius: 15, borderWidth: 1, flex: 1, gap: 6, minHeight: 76, justifyContent: "center", padding: 8 },
  kindButtonText: { fontSize: 13, fontWeight: "900" },
  fieldLabel: { fontSize: 13, fontWeight: "800" },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choiceChip: { borderRadius: 999, borderWidth: 1, minHeight: 40, justifyContent: "center", paddingHorizontal: 14 },
  choiceChipText: { fontSize: 13, fontWeight: "900" },
  twoColumns: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  column: { flex: 1, minWidth: 140 },
  switchRow: { alignItems: "center", borderRadius: 15, borderWidth: 1, flexDirection: "row", gap: 12, minHeight: 72, padding: 13 },
  switchLabel: { fontSize: 14, fontWeight: "900" },
  switchDescription: { fontSize: 12, lineHeight: 17 },
  flexText: { flex: 1, gap: 3, minWidth: 0 },
  dateField: { gap: 7 },
  dateControl: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 9, minHeight: 54, paddingHorizontal: 13 },
  dateValue: { fontSize: 14, fontWeight: "700" },
  clearButton: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 5, minHeight: 30 },
  clearText: { fontSize: 12, fontWeight: "800" },
  helper: { fontSize: 12, lineHeight: 18 },
  requestCard: { gap: 14 },
  smartProgress: { borderRadius: 15, borderWidth: 1, gap: 10, padding: 13 },
  smartProgressTitle: { fontSize: 14, fontWeight: "900" },
  progressSources: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  progressSource: { alignItems: "center", flexDirection: "row", gap: 4 },
  progressSourceText: { fontSize: 12, fontWeight: "800" },
  requestTop: { alignItems: "center", flexDirection: "row", gap: 11 },
  kindIcon: { alignItems: "center", borderRadius: 14, height: 46, justifyContent: "center", width: 46 },
  requestTitle: { fontSize: 16, fontWeight: "900", lineHeight: 21 },
  requestMeta: { fontSize: 12, fontWeight: "700", lineHeight: 17 },
  matchSummary: { alignItems: "center", borderRadius: 15, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", padding: 13 },
  matchCount: { fontSize: 23, fontWeight: "900" },
  matchLabel: { fontSize: 12, fontWeight: "700" },
  openMatches: { alignItems: "center", flexDirection: "row", gap: 3 },
  openMatchesText: { fontSize: 13, fontWeight: "900" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  smallAction: { borderRadius: 11, borderWidth: 1, minHeight: 40, justifyContent: "center", paddingHorizontal: 12 },
  smallActionText: { fontSize: 12, fontWeight: "900" },
  matchCard: { gap: 13 },
  matchDetail: { fontSize: 14, fontWeight: "700", lineHeight: 20 },
  backButton: { alignItems: "center", borderRadius: 14, borderWidth: 1, height: 46, justifyContent: "center", width: 46 },
});
