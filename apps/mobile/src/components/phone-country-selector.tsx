import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getMobileCountry, searchMobileCountries } from "@/features/whatsapp/phone";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

export function PhoneCountrySelector({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const theme = useTheme(); const { t } = useTranslation();
  const [open, setOpen] = useState(false); const [query, setQuery] = useState("");
  const country = getMobileCountry(value);
  const countries = useMemo(() => searchMobileCountries(query), [query]);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${t("selectCountry")}: ${country.nativeCountryName} ${country.callingCode}`} onPress={() => { setQuery(""); setOpen(true); }} style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.cardMuted, borderRadius: 14, padding: 14 }}><Text style={{ color: theme.text, flex: 1, fontWeight: "700" }}>{country.nativeCountryName}</Text><Text style={{ color: theme.primary, fontWeight: "800", writingDirection: "ltr" }}>{country.callingCode}</Text><Ionicons name="chevron-down" size={20} color={theme.muted} /></Pressable>
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}><SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ padding: 18, gap: 16 }}><View style={{ flexDirection: "row", alignItems: "center" }}><Text style={{ flex: 1, color: theme.text, fontSize: 24, fontWeight: "800" }}>{t("selectCountry")}</Text><Pressable accessibilityLabel={t("close")} accessibilityRole="button" onPress={() => setOpen(false)} style={{ padding: 10, minHeight: 44, minWidth: 44 }}><Ionicons name="close" color={theme.primary} size={26} /></Pressable></View><TextInput accessibilityLabel={t("searchCountry")} value={query} onChangeText={setQuery} placeholder={t("searchCountryPlaceholder")} placeholderTextColor={theme.muted} autoCapitalize="none" style={{ minHeight: 52, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 16, color: theme.text }} /></View>
      <FlatList data={countries} keyExtractor={item => item.countryIso} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, gap: 10 }} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityState={{ selected: item.countryIso === value }} onPress={() => { onChange(item.countryIso); setOpen(false); }} style={{ minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: item.countryIso === value ? theme.primary : theme.border, backgroundColor: theme.card, borderRadius: 16, padding: 16 }}><View style={{ flex: 1 }}><Text style={{ color: theme.text, fontWeight: "800", fontSize: 17 }}>{item.nativeCountryName}</Text><Text style={{ color: theme.muted, marginTop: 6 }}>{item.countryName} · {item.countryIso}</Text></View><Text style={{ color: theme.primary, fontWeight: "800", writingDirection: "ltr" }}>{item.callingCode}</Text></Pressable>} />
    </SafeAreaView></Modal>
  </>;
}
