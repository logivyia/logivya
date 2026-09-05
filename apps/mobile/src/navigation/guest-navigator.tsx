import { createNativeStackNavigator, type NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useRef, useState, type ComponentProps } from "react";
import { ActivityIndicator, AppState, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getPublicCatalog, getPublicCatalogDetail, type PublicCatalogListing } from "@/api/publicMarketplace";
import { useGuestStore } from "@/auth/guest-store";
import { LiveMarketplaceListingCard } from "@/components/live-marketplace-listing-card";
import { LowbedIcon } from "@/components/lowbed-icon";
import { CatalogFilters, emptyMarketplaceFilters, marketplaceFilterParams, type MarketplaceFilters } from "@/features/freight/catalog-filters";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import { publicMarketplaceSection, publicMarketplaceSections } from "../../../../shared/public-marketplace-sections";
type GuestStack = { GuestExplore: { section?: string } | undefined; GuestDetail: { id: string; kind: string } };
const Stack = createNativeStackNavigator<GuestStack>();
export function GuestNavigator() { return <Stack.Navigator screenOptions={{ headerShown: false }}><Stack.Screen name="GuestExplore" component={GuestExplore} /><Stack.Screen name="GuestDetail" component={GuestDetail} /></Stack.Navigator>; }

function GuestExplore({ route, navigation }: NativeStackScreenProps<GuestStack, "GuestExplore">) {
  const theme = useTheme(); const { locale, t } = useTranslation(); const tr = locale === "tr";
  const section = publicMarketplaceSection(route.params?.section);
  const [menu, setMenu] = useState(false);
  const [filters, setFilters] = useState<MarketplaceFilters>({ ...emptyMarketplaceFilters, kind: "kind" in section ? section.kind : "" });
  const [items, setItems] = useState<PublicCatalogListing[]>([]); const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const generation = useRef(0); const inFlight = useRef(false);
  const loadedCount = useRef(60);
  const privateSection = "private" in section && section.private;
  const scope = "scope" in section ? section.scope : "GLOBAL";
  const query = marketplaceFilterParams(filters);
  const load = useCallback(async (before?: string, quiet = false) => {
    if (inFlight.current && quiet) return;
    inFlight.current = true;
    const run = ++generation.current;
    if (!quiet) setLoading(true);
    try {
      const page = await getPublicCatalog(`scope=${scope}&${query}&limit=${before ? Math.min(60, 1000 - loadedCount.current) : loadedCount.current}${before ? `&before=${encodeURIComponent(before)}` : ""}`);
      if (run !== generation.current) return;
      setItems((current) => before ? [...new Map([...current, ...page.items].map((item) => [`${item.kind}:${item.id}`, item])).values()] : page.items);
      loadedCount.current = Math.min(1000, before ? loadedCount.current + page.items.length : Math.max(60, page.items.length));
      setNext(loadedCount.current < 1000 ? page.nextCursor : null); setError(false);
    } catch { if (run === generation.current) setError(true); }
    finally { if (run === generation.current) { setLoading(false); inFlight.current = false; } }
  }, [query, scope]);
  useFocusEffect(useCallback(() => {
    if (privateSection) { setLoading(false); return; }
    void load(); const timer = setInterval(() => { if (AppState.currentState === "active") void load(undefined, true); }, 20_000);
    return () => { clearInterval(timer); generation.current += 1; inFlight.current = false; };
  }, [load, privateSection]));
  const go = (id: string) => { setMenu(false); if (id !== section.id) navigation.push("GuestExplore", { section: id }); };
  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
    <View style={[styles.header, { borderColor: theme.border, backgroundColor: theme.card }]}><Pressable accessibilityLabel={tr ? "Menüyü aç" : "Open menu"} onPress={() => setMenu(true)} style={styles.iconButton}><Ionicons name="menu" size={28} color={theme.text} /></Pressable><Text style={[styles.brand, { color: theme.text }]}>LOGIVYA</Text><View style={styles.authActions}><Pressable accessibilityRole="button" onPress={() => useGuestStore.getState().authenticate()} style={[styles.authButton, { borderColor: theme.border, borderWidth: 1 }]}><Text style={{ color: theme.text, fontWeight: "800", fontSize: 12 }}>{t("login")}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => useGuestStore.getState().authenticate("Register")} style={[styles.authButton, { backgroundColor: theme.primary }]}><Text style={{ color: theme.primaryText, fontWeight: "800", fontSize: 12 }}>{t("register")}</Text></Pressable></View></View>
    <FlatList data={privateSection ? [] : items} keyExtractor={(item) => `${item.kind}:${item.id}`} contentContainerStyle={styles.content} ItemSeparatorComponent={() => <View style={{ height: 14 }} />} initialNumToRender={6}
      renderItem={({ item }) => <LiveMarketplaceListingCard listing={item} onPress={() => navigation.push("GuestDetail", { id: item.id, kind: item.kind })} />}
      refreshControl={!privateSection ? <RefreshControl refreshing={loading && items.length > 0} onRefresh={() => void load()} tintColor={theme.primary} /> : undefined}
      ListHeaderComponent={<View style={{ marginBottom: 20, gap: 12 }}>
        {navigation.canGoBack() ? <Pressable onPress={() => navigation.goBack()} style={styles.back}><Ionicons name="arrow-back" size={20} color={theme.primary} /><Text style={{ color: theme.primary }}>{tr ? "Geri" : "Back"}</Text></Pressable> : null}
        <Text style={{ color: theme.primary, fontSize: 11, letterSpacing: 2, fontWeight: "900" }}>{t("logisticsMarketplace")}</Text>
        <Text style={[styles.title, { color: theme.text }]}>{section.id === "overview" ? t("liveListings") : tr ? section.tr : section.en}</Text>
        <Text style={[styles.description, { color: theme.muted }]}>{tr ? section.description : section.english}</Text>
        {privateSection ? <GuestAccessCard /> : <>
          <CatalogFilters value={filters} onApply={(value) => { loadedCount.current = 60; setItems([]); setNext(null); setFilters(value); }} />
          {section.id === "vehicles" ? <Pressable onPress={() => go("share-vehicle")} style={[styles.button, { backgroundColor: theme.primary }]}><Text style={{ color: theme.primaryText, fontWeight: "900" }}>{tr ? "Araç Paylaş" : "Share Vehicle"}</Text></Pressable> : null}
          <Text style={{ color: theme.muted, lineHeight: 20, fontSize: 12 }}>{tr ? "İletişim için kayıt ve geçerli deneme veya abonelik gerekir." : "Contact requires registration and an active trial or subscription."}</Text>
          {error ? <Pressable onPress={() => void load()} style={[styles.panel, { borderColor: theme.border }]}><Text style={{ color: theme.text }}>{tr ? "İlanlar yüklenemedi. Yeniden denemek için dokunun." : "Unable to load listings. Tap to retry."}</Text></Pressable> : null}
        </>}
      </View>}
      ListEmptyComponent={privateSection ? null : loading ? <ActivityIndicator size="large" color={theme.primary} /> : !error ? <Text style={{ color: theme.muted, textAlign: "center", padding: 24 }}>{tr ? "Bu filtrelere uygun ilan bulunamadı." : "No listings match these filters."}</Text> : null}
      ListFooterComponent={next && !privateSection ? <Pressable disabled={loading} onPress={() => void load(next)} style={[styles.button, { borderWidth: 1, borderColor: theme.border, marginTop: 20 }]}><Text style={{ color: theme.text }}>{tr ? "Daha fazla ilan" : "More listings"}</Text></Pressable> : null}
    />
    <View style={[styles.bottom, { backgroundColor: theme.card, borderColor: theme.border }]}>{[11,12,13,14,16].map((index) => { const item = publicMarketplaceSections[index]!; return <Pressable key={item.id} onPress={() => go(item.id)} style={styles.bottomItem}><Ionicons name={item.icon as ComponentProps<typeof Ionicons>["name"]} size={25} color={item.id === section.id ? theme.primary : theme.muted} /><Text style={{ color: item.id === section.id ? theme.primary : theme.muted, fontSize: 10, fontWeight: "800", textAlign: "center" }}>{tr ? item.tr : item.en}</Text></Pressable>; })}</View>
    <Modal visible={menu} animationType="slide" onRequestClose={() => setMenu(false)}><SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}><View style={styles.header}><Text style={[styles.brand, { color: theme.text }]}>LOGIVYA</Text><Pressable accessibilityLabel={tr ? "Menüyü kapat" : "Close menu"} style={styles.iconButton} onPress={() => setMenu(false)}><Ionicons name="close" size={27} color={theme.text} /></Pressable></View><ScrollView contentContainerStyle={{ padding: 16, gap: 5 }}>{publicMarketplaceSections.map((item) => <Pressable key={item.id} onPress={() => go(item.id)} style={[styles.menuItem, { backgroundColor: item.id === section.id ? theme.badge : theme.background }]}>{item.icon === "lowbed" ? <LowbedIcon size={26} color={theme.muted} /> : <Ionicons name={item.icon as ComponentProps<typeof Ionicons>["name"]} size={25} color={theme.muted} />}<Text style={{ color: theme.text, fontWeight: "800", fontSize: 15 }}>{tr ? item.tr : item.en}</Text></Pressable>)}</ScrollView></SafeAreaView></Modal>
  </SafeAreaView>;
}

function GuestDetail({ route, navigation }: NativeStackScreenProps<GuestStack, "GuestDetail">) {
  const theme = useTheme(); const { locale } = useTranslation(); const tr = locale === "tr";
  const [listing, setListing] = useState<PublicCatalogListing | null>(null); const [error, setError] = useState(false);
  useFocusEffect(useCallback(() => { let active = true; void getPublicCatalogDetail(route.params.kind, route.params.id).then((data) => { if (active) setListing(data.listing); }).catch(() => { if (active) setError(true); }); return () => { active = false; }; }, [route.params.id, route.params.kind]));
  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}><View style={styles.header}><Pressable onPress={() => navigation.goBack()} style={styles.back}><Ionicons name="arrow-back" size={24} color={theme.text} /><Text style={{ color: theme.text }}>{tr ? "Geri" : "Back"}</Text></Pressable></View><ScrollView contentContainerStyle={styles.content}>
    {listing ? <View style={{ gap: 20 }}><Text style={{ color: theme.primary, fontWeight: "800" }}>{listing.publicAdvertiserName}</Text><Text style={[styles.title, { color: theme.text }]}>{listing.publicTitle}</Text><Text style={{ color: theme.text, fontWeight: "700" }}>{[listing.tonnageDisplay, listing.vehicleDisplayName].filter(Boolean).join(" · ")}</Text><Text style={[styles.description, { color: theme.muted }]}>{listing.publicDescription}</Text><View style={[styles.panel, { borderColor: theme.border, gap: 12 }]}><Text style={{ color: theme.text }}>{listing.loadingDisplayName}{listing.deliveryDisplayName ? ` → ${listing.deliveryDisplayName}` : ""}</Text><Text style={{ color: theme.muted }}>{listing.sourcePlatformDisplay} · {new Date(listing.publishedAt).toLocaleDateString(locale)}</Text></View><GuestAccessCard contact /></View> : error ? <Text style={{ color: theme.muted }}>{tr ? "İlan bulunamadı veya süresi doldu." : "This listing was not found or has expired."}</Text> : <ActivityIndicator size="large" color={theme.primary} />}
  </ScrollView></SafeAreaView>;
}
function GuestAccessCard({ contact = false }: { contact?: boolean }) {
  const theme = useTheme(); const { locale } = useTranslation(); const tr = locale === "tr";
  return <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.card, gap: 14, marginTop: 14 }]}><Ionicons name="lock-closed-outline" size={26} color={theme.primary} /><Text style={{ color: theme.text, fontWeight: "900", fontSize: 18 }}>{tr ? contact ? "İletişim için hesabınızla devam edin" : "Hesabınızla devam edin" : contact ? "Sign in to contact the advertiser" : "Continue with your account"}</Text><Text style={{ color: theme.muted, lineHeight: 22 }}>{tr ? "Kayıt olduktan sonra 7 gün ücretsiz deneyin. İletişim özellikleri geçerli deneme veya abonelik ile açılır." : "Try free for 7 days after registering. Contact requires an active trial or subscription."}</Text><Pressable style={[styles.button, { backgroundColor: theme.primary }]} onPress={() => useGuestStore.getState().authenticate("Register")}><Text style={{ color: theme.primaryText, fontWeight: "900" }}>{tr ? "Kayıt ol · 7 gün ücretsiz" : "Register · 7 days free"}</Text></Pressable><Pressable style={styles.button} onPress={() => useGuestStore.getState().authenticate()}><Text style={{ color: theme.primary, fontWeight: "800" }}>{tr ? "Giriş yap" : "Sign in"}</Text></Pressable></View>;
}
const styles = StyleSheet.create({ header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth }, brand: { fontSize: 16, letterSpacing: 2, fontWeight: "900", flex: 1, flexShrink: 1 }, authActions: { flexDirection: "row", gap: 6 }, authButton: { minHeight: 44, paddingHorizontal: 10, paddingVertical: 10, justifyContent: "center", alignItems: "center", borderRadius: 12 }, iconButton: { padding: 8, minWidth: 44, minHeight: 44 }, title: { fontSize: 29, fontWeight: "900", lineHeight: 37 }, description: { fontSize: 16, lineHeight: 26 }, content: { padding: 18, paddingBottom: 32 }, button: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, paddingVertical: 12 }, panel: { borderWidth: 1, borderRadius: 20, padding: 20 }, bottom: { flexDirection: "row", borderTopWidth: 1, paddingTop: 10, paddingBottom: 8 }, bottomItem: { flex: 1, alignItems: "center", gap: 7, minHeight: 58, paddingHorizontal: 3 }, menuItem: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16, minHeight: 58, borderRadius: 14 }, back: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 } });
