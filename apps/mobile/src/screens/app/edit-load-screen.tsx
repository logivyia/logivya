import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";

import { getFreightListing, updateFreightListing, type FreightListingPayload, type MobileFreightListing } from "@/api/mobileFreight";
import { useAuthStore } from "@/auth/auth-store";
import { FreightListingForm } from "@/components/freight-listing-form";
import { Screen } from "@/components/screen";
import { ErrorState } from "@/components/state/error-state";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { MyListingsStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<MyListingsStackParamList, "EditFreightListing">;

export function EditLoadScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const company = useAuthStore((state) => state.company);
  const [listing, setListing] = useState<MobileFreightListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getFreightListing(route.params.listingId);
      setListing(response.listing);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("freightDetailsFailed"));
    } finally {
      setLoading(false);
    }
  }, [route.params.listingId, t]);

  useFocusEffect(useCallback(() => { if (!listing) void load(); }, [listing, load]));

  async function submit(payload: FreightListingPayload) {
    if (!listing || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateFreightListing(listing.id, payload);
      Alert.alert(t("freightUpdatedTitle"), t("freightUpdatedDescription"), [{ text: t("confirm"), onPress: () => navigation.goBack() }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("freightUpdateFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !listing) return <Screen><View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /><Text style={{ color: theme.muted }}>{t("freightLoadingDetails")}</Text></View></Screen>;
  if (error && !listing) return <Screen><ErrorState title={error} onRetry={() => void load()} /></Screen>;
  if (!listing) return null;

  return (
    <FreightListingForm
      listing={listing}
      defaultPhone={user?.phone ?? ""}
      defaultCurrency={company?.defaultCurrency ?? "TRY"}
      saving={saving}
      error={error}
      submitTitle={t("saveChanges")}
      title={t("editListing")}
      description={t("editListingDescription")}
      onSubmit={submit}
    />
  );
}

const styles = StyleSheet.create({ center: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center" } });
