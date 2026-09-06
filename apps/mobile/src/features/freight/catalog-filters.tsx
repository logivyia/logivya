import { productJourneyCopy } from "../../../../../shared/product-journey-copy";
import { mobileCountryLabel } from "./country-labels";
import { marketplaceOptionLabel } from "../../../../../shared/product-status-copy";
import { driverLicenseOptions, driverEmploymentOptions } from "../../../../../shared/marketplace-filters";
import { uzbekMarketplaceUi as uz, uzbekVehicleLabels, uzbekCountryLabels } from "../../../../../shared/uzbek-marketplace-ui";
import { guestMarketplaceCopy } from "../../../../../shared/guest-marketplace-copy";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme/theme-provider";
import { useTranslation } from "@/i18n/use-translation";
import { emptyMarketplaceFilters, marketplaceCountries, marketplaceVehicles, type MarketplaceFilters } from "../../../../../shared/marketplace-filters";
export { emptyMarketplaceFilters, marketplaceFilterParams, matchesMarketplaceFilters, type MarketplaceFilters } from "../../../../../shared/marketplace-filters";

export function CatalogFilters({ value, onApply }: { value: MarketplaceFilters; onApply: (value: MarketplaceFilters) => void }) {
  const theme = useTheme(); const { locale } = useTranslation(); const tr = locale === "tr"; const copy = productJourneyCopy(locale);
  const [open, setOpen] = useState(false); const [draft, setDraft] = useState(value);
  const [select, setSelect] = useState<"originCountry" | "destinationCountry" | "vehicle" | "licenseClass" | "employmentType" | "driverListingType" | null>(null);
  const active = Object.entries(value).filter(([key, item]) => key !== "kind" && item).length;
  const label = (key: string) => ({ ...copy, licenseClass: copy.licenses, employmentType: copy.employment, driverListingType: copy.filters } as Record<string, string>)[key];
  const button = [styles.button, { borderColor: theme.border, backgroundColor: theme.card }];
  const optionsFor = (key: string): ReadonlyArray<readonly [string, string]> => [["", copy.all], ...(key === "vehicle" ? marketplaceVehicles.map(([code]) => [code, marketplaceOptionLabel(code, locale)] as const) : key === "licenseClass" ? driverLicenseOptions.map(code => [code, code] as const) : key === "employmentType" ? driverEmploymentOptions.map(code => [code, marketplaceOptionLabel(code, locale)] as const) : key === "driverListingType" ? [["DRIVER_AVAILABLE", copy.driverAvailable], ["DRIVER_WANTED", copy.driverWanted]] as const : marketplaceCountries.map(([code, title]) => [code, mobileCountryLabel(code, locale, title)] as const))];
  const titleFor = (key: string, current?: string) => optionsFor(key).find(([code]) => code === current)?.[1] || copy.all;
  return <View style={{ marginVertical: 12 }}>
    <Pressable accessibilityRole="button" onPress={() => { setDraft(value); setSelect(null); setOpen(true); }} style={button}><Ionicons name="options-outline" size={21} color={theme.primary} /><Text style={{ color: theme.text, fontWeight: "800" }}>{guestMarketplaceCopy(locale).filterListings}{active ? ` (${active})` : ""}</Text></Pressable>
    {active ? <Text style={{ marginTop: 8, color: theme.muted }}>{[value.originCity || titleFor("originCountry", value.originCountry), value.destinationCity || titleFor("destinationCountry", value.destinationCountry)].join(" → ")}{value.vehicle ? ` · ${titleFor("vehicle", value.vehicle)}` : ""}</Text> : null}
    <Modal visible={open} animationType="slide" onRequestClose={() => select ? setSelect(null) : setOpen(false)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}><View style={styles.heading}><Text style={{ color: theme.text, fontSize: 22, fontWeight: "900", flex: 1 }}>{select ? label(select) : copy.filters}</Text><Pressable style={button} accessibilityLabel={copy.close} onPress={() => select ? setSelect(null) : setOpen(false)}><Ionicons name={select ? "arrow-back" : "close"} size={23} color={theme.text} /></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
        {select ? optionsFor(select).map(([code, title]) => <Pressable key={code} style={button} onPress={() => { setDraft({ ...draft, [select]: code }); setSelect(null); }}><Text style={{ color: theme.text, flex: 1 }}>{title}</Text>{draft[select] === code ? <Ionicons name="checkmark" size={22} color={theme.primary} /> : null}</Pressable>) : <>
          {draft.kind !== "DRIVER" ? <>{(["originCountry", "destinationCountry"] as const).map((key) => <View key={key}><Text style={{ color: theme.muted, marginBottom: 8 }}>{label(key)}</Text><Pressable onPress={() => setSelect(key)} style={button}><Text style={{ color: theme.text, flex: 1 }}>{titleFor(key, draft[key])}</Text><Ionicons name="chevron-down" size={18} color={theme.muted} /></Pressable></View>)}
          {(["originCity", "destinationCity"] as const).map((key) => <View key={key}><Text style={{ color: theme.muted, marginBottom: 8 }}>{label(key)}</Text><TextInput accessibilityLabel={label(key)} maxLength={80} value={draft[key]} onChangeText={(text) => setDraft({ ...draft, [key]: text })} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]} /></View>)}
          <View><Text style={{ color: theme.muted, marginBottom: 8 }}>{label("vehicle")}</Text><Pressable onPress={() => setSelect("vehicle")} style={button}><Text style={{ color: theme.text, flex: 1 }}>{titleFor("vehicle", draft.vehicle)}</Text><Ionicons name="chevron-down" size={18} color={theme.muted} /></Pressable></View>
          </> : <>
            <Text style={{ color: theme.muted }}>{copy.location}</Text><TextInput accessibilityLabel={copy.location} maxLength={80} value={draft.location || ""} onChangeText={location => setDraft({ ...draft, location })} style={[styles.input, { color: theme.text, borderColor: theme.border }]} />
            {(["driverListingType", "licenseClass", "employmentType"] as const).map(key => <View key={key}><Text style={{ color: theme.muted, marginBottom: 8 }}>{label(key)}</Text><Pressable onPress={() => setSelect(key)} style={button}><Text style={{ color: theme.text, flex: 1 }}>{titleFor(key, draft[key])}</Text><Ionicons name="chevron-down" size={18} color={theme.muted} /></Pressable></View>)}
            {(["adrRequired", "internationalRequired"] as const).map(key => <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: draft[key] === "true" }} style={button} onPress={() => setDraft({ ...draft, [key]: draft[key] === "true" ? "" : "true" })}><Ionicons name={draft[key] === "true" ? "checkbox" : "square-outline"} size={22} color={theme.primary} /><Text style={{ color: theme.text }}>{key === "adrRequired" ? copy.adr : copy.international}</Text></Pressable>)}
          </>}
          <Pressable style={[button, { backgroundColor: theme.primary }]} onPress={() => { onApply(draft); setOpen(false); }}><Text style={{ color: theme.primaryText, fontWeight: "900" }}>{copy.apply}</Text></Pressable><Pressable style={button} onPress={() => { const cleared = { ...emptyMarketplaceFilters, kind: value.kind }; setDraft(cleared); onApply(cleared); setOpen(false); }}><Text style={{ color: theme.text }}>{copy.clear}</Text></Pressable>
        </>}
      </ScrollView></SafeAreaView>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({ button: { minHeight: 50, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 10 }, input: { minHeight: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, fontSize: 16 }, heading: { padding: 20, flexDirection: "row", alignItems: "center", gap: 16 } });
