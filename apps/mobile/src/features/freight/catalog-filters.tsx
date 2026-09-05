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
  const theme = useTheme(); const { locale } = useTranslation(); const tr = locale === "tr";
  const [open, setOpen] = useState(false); const [draft, setDraft] = useState(value);
  const [select, setSelect] = useState<"originCountry" | "destinationCountry" | "vehicle" | null>(null);
  const active = Object.entries(value).filter(([key, item]) => key !== "kind" && item).length;
  const label = (key: string) => ({ originCountry: tr ? "Kalkış ülkesi" : "Origin country", destinationCountry: tr ? "Varış ülkesi" : "Destination country", originCity: tr ? "Kalkış şehri / ilçesi" : "Origin city / district", destinationCity: tr ? "Varış şehri / ilçesi" : "Destination city / district", vehicle: tr ? "Araç tipi" : "Vehicle type" })[key];
  const button = [styles.button, { borderColor: theme.border, backgroundColor: theme.card }];
  const titleFor = (key: "originCountry" | "destinationCountry" | "vehicle", current: string) => (key === "vehicle" ? marketplaceVehicles : marketplaceCountries).find(([code]) => code === current)?.[1] ?? (tr ? "Tümü" : "All");
  return <View style={{ marginVertical: 12 }}>
    <Pressable accessibilityRole="button" onPress={() => { setDraft(value); setSelect(null); setOpen(true); }} style={button}><Ionicons name="options-outline" size={21} color={theme.primary} /><Text style={{ color: theme.text, fontWeight: "800" }}>{guestMarketplaceCopy(locale).filterListings}{active ? ` (${active})` : ""}</Text></Pressable>
    {active ? <Text style={{ marginTop: 8, color: theme.muted }}>{[value.originCity || titleFor("originCountry", value.originCountry), value.destinationCity || titleFor("destinationCountry", value.destinationCountry)].join(" → ")}{value.vehicle ? ` · ${titleFor("vehicle", value.vehicle)}` : ""}</Text> : null}
    <Modal visible={open} animationType="slide" onRequestClose={() => select ? setSelect(null) : setOpen(false)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}><View style={styles.heading}><Text style={{ color: theme.text, fontSize: 22, fontWeight: "900", flex: 1 }}>{select ? label(select) : tr ? "İlan filtreleri" : "Listing filters"}</Text><Pressable style={button} accessibilityLabel={tr ? "Kapat" : "Close"} onPress={() => select ? setSelect(null) : setOpen(false)}><Ionicons name={select ? "arrow-back" : "close"} size={23} color={theme.text} /></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
        {select ? [["", tr ? "Tümü" : "All"], ...(select === "vehicle" ? marketplaceVehicles : marketplaceCountries)].map(([code, title]) => <Pressable key={code} style={button} onPress={() => { setDraft({ ...draft, [select]: code }); setSelect(null); }}><Text style={{ color: theme.text, flex: 1 }}>{title}</Text>{draft[select] === code ? <Ionicons name="checkmark" size={22} color={theme.primary} /> : null}</Pressable>) : <>
          {(["originCountry", "destinationCountry"] as const).map((key) => <View key={key}><Text style={{ color: theme.muted, marginBottom: 8 }}>{label(key)}</Text><Pressable onPress={() => setSelect(key)} style={button}><Text style={{ color: theme.text, flex: 1 }}>{titleFor(key, draft[key])}</Text><Ionicons name="chevron-down" size={18} color={theme.muted} /></Pressable></View>)}
          {(["originCity", "destinationCity"] as const).map((key) => <View key={key}><Text style={{ color: theme.muted, marginBottom: 8 }}>{label(key)}</Text><TextInput accessibilityLabel={label(key)} maxLength={80} value={draft[key]} onChangeText={(text) => setDraft({ ...draft, [key]: text })} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]} /></View>)}
          <View><Text style={{ color: theme.muted, marginBottom: 8 }}>{label("vehicle")}</Text><Pressable onPress={() => setSelect("vehicle")} style={button}><Text style={{ color: theme.text, flex: 1 }}>{titleFor("vehicle", draft.vehicle)}</Text><Ionicons name="chevron-down" size={18} color={theme.muted} /></Pressable></View>
          <Pressable style={[button, { backgroundColor: theme.primary }]} onPress={() => { onApply(draft); setOpen(false); }}><Text style={{ color: theme.primaryText, fontWeight: "900" }}>{tr ? "Filtreleri uygula" : "Apply filters"}</Text></Pressable><Pressable style={button} onPress={() => { const cleared = { ...emptyMarketplaceFilters, kind: value.kind }; setDraft(cleared); onApply(cleared); setOpen(false); }}><Text style={{ color: theme.text }}>{tr ? "Filtreleri temizle" : "Clear filters"}</Text></Pressable>
        </>}
      </ScrollView></SafeAreaView>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({ button: { minHeight: 50, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 10 }, input: { minHeight: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, fontSize: 16 }, heading: { padding: 20, flexDirection: "row", alignItems: "center", gap: 16 } });
