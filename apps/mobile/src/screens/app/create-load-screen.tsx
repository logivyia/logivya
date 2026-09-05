import * as Crypto from "expo-crypto";
import type { NavigationProp } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Alert } from "react-native";
import { useRef, useState } from "react";

import { createFreightListing, type FreightListingPayload } from "@/api/mobileFreight";
import { useAuthStore } from "@/auth/auth-store";
import { FreightListingForm } from "@/components/freight-listing-form";
import { useTranslation } from "@/i18n/use-translation";
import type { AppTabParamList, CreateLoadStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<CreateLoadStackParamList, "CreateLoadHome">;

export function CreateLoadScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const company = useAuthStore((state) => state.company);
  const clientRequestId = useRef(Crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(payload: FreightListingPayload) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await createFreightListing({ ...payload, clientRequestId: clientRequestId.current });
      Alert.alert(t("freightPublishedTitle"), t("freightPublishedDescription"), [
        {
          text: t("viewMyListings"),
          onPress: () => navigation.getParent<NavigationProp<AppTabParamList>>()?.navigate("MyListings"),
        },
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("freightCreateFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FreightListingForm
      defaultPhone={user?.phone ?? ""}
      defaultCurrency={company?.defaultCurrency ?? "TRY"}
      saving={saving}
      error={error}
      submitTitle={t("publishLoad")}
      title={t("createLoad")}
      description={t("createLoadDescription")}
      {...(route.params?.sector ? { initialSector: route.params.sector } : {})}
      sectorLocked={Boolean(route.params?.sector)}
      onSubmit={submit}
    />
  );
}
