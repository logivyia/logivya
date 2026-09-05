import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  getAvailablePurchases as getAvailablePurchasesFromStore,
  useIAP,
  type ProductSubscriptionAndroid,
  type Purchase,
  type SubscriptionOffer,
} from "expo-iap";

import {
  getGooglePlayPurchaseContext,
  verifyGooglePlayPurchase,
  type GooglePlayPurchaseContext,
  type MobilePlanCatalogItem,
} from "@/api/mobileSubscription";
import { PrimaryButton } from "@/components/primary-button";
import { SurfaceCard } from "@/components/ui";
import { MobilePlanBenefits, MobilePlanDetailsDisclosure, MobilePlanSeatInfo } from "@/features/subscription/mobile-plan-benefits";
import { isUserCancelledPurchase } from "@/features/subscription/purchase-errors";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

type BillingInterval = "MONTHLY" | "YEARLY";

type VisibleGoogleProduct = {
  product: ProductSubscriptionAndroid;
  offer: SubscriptionOffer;
};

export function GooglePlaySubscriptionStore({
  plans,
  onActivated,
}: {
  plans: MobilePlanCatalogItem[];
  onActivated: () => Promise<void> | void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [context, setContext] = useState<GooglePlayPurchaseContext | null>(
    null,
  );
  const [interval, setInterval] = useState<BillingInterval>("MONTHLY");
  const [loadingContext, setLoadingContext] = useState(true);
  const [processingProductId, setProcessingProductId] = useState<string | null>(
    null,
  );
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPurchase, setPendingPurchase] = useState<Purchase | null>(null);

  const {
    connected,
    subscriptions,
    fetchProducts,
    finishTransaction,
    requestPurchase,
  } = useIAP({
    onPurchaseSuccess: setPendingPurchase,
    onPurchaseError: (purchaseError) => {
      setProcessingProductId(null);
      if (isUserCancelledPurchase(purchaseError)) {
        setError(null);
        return;
      }
      setError(purchaseError.message || t("billing.google.purchaseFailed"));
    },
    onError: (storeError) => {
      if (isUserCancelledPurchase(storeError)) {
        setProcessingProductId(null);
        setError(null);
        return;
      }
      setError(storeError.message || t("billing.google.purchaseFailed"));
    },
  });

  const handleVerifiedPurchase = useCallback(
    async (purchase: Purchase) => {
      if (purchase.store !== "google" || !purchase.purchaseToken) return false;
      await verifyGooglePlayPurchase({
        purchaseToken: purchase.purchaseToken,
        productId: purchase.productId,
        ...(purchase.currentPlanId
          ? { basePlanId: purchase.currentPlanId }
          : {}),
      });
      await finishTransaction({ purchase, isConsumable: false });
      await onActivated();
      return true;
    },
    [finishTransaction, onActivated],
  );

  useEffect(() => {
    if (!pendingPurchase) return;
    setProcessingProductId(pendingPurchase.productId);
    void handleVerifiedPurchase(pendingPurchase)
      .then((verified) => {
        if (verified) Alert.alert(t("billing.google.purchaseSuccess"));
      })
      .catch((purchaseError) => {
        setError(
          purchaseError instanceof Error
            ? purchaseError.message
            : t("billing.google.purchaseFailed"),
        );
      })
      .finally(() => {
        setPendingPurchase(null);
        setProcessingProductId(null);
      });
  }, [handleVerifiedPurchase, pendingPurchase, t]);

  useEffect(() => {
    let active = true;
    setLoadingContext(true);
    getGooglePlayPurchaseContext()
      .then((value) => {
        if (active) setContext(value);
      })
      .catch((contextError) => {
        if (active) {
          setError(
            contextError instanceof Error
              ? contextError.message
              : t("billing.google.purchaseFailed"),
          );
        }
      })
      .finally(() => {
        if (active) setLoadingContext(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  useEffect(() => {
    if (!connected || !context?.canPurchase || !context.productIds.length)
      return;
    void fetchProducts({ skus: context.productIds, type: "subs" });
  }, [connected, context, fetchProducts]);

  const visibleProducts = useMemo(() => {
    const basePlanId = interval === "MONTHLY" ? "monthly" : "yearly";
    return subscriptions
      .filter(
        (product): product is ProductSubscriptionAndroid =>
          product.platform === "android" &&
          Boolean(context?.productIds.includes(product.id)),
      )
      .map((product): VisibleGoogleProduct | null => {
        const offer = product.subscriptionOffers.find(
          (candidate) =>
            candidate.basePlanIdAndroid === basePlanId &&
            Boolean(candidate.offerTokenAndroid),
        );
        return offer ? { product, offer } : null;
      })
      .filter((entry): entry is VisibleGoogleProduct => Boolean(entry))
      .sort((left, right) => {
        const order = (planForProduct(plans, left.product.id)?.sortOrder ?? Number.MAX_SAFE_INTEGER)
          - (planForProduct(plans, right.product.id)?.sortOrder ?? Number.MAX_SAFE_INTEGER);
        return order || left.product.id.localeCompare(right.product.id);
      });
  }, [context, interval, plans, subscriptions]);

  async function startPurchase({ product, offer }: VisibleGoogleProduct) {
    if (
      !context?.obfuscatedAccountId ||
      !context.obfuscatedProfileId ||
      !offer.offerTokenAndroid
    )
      return;
    setError(null);
    setProcessingProductId(product.id);
    try {
      await requestPurchase({
        request: {
          google: {
            skus: [product.id],
            subscriptionOffers: [
              {
                sku: product.id,
                offerToken: offer.offerTokenAndroid,
              },
            ],
            obfuscatedAccountId: context.obfuscatedAccountId,
            obfuscatedProfileId: context.obfuscatedProfileId,
          },
        },
        type: "subs",
      });
    } catch (purchaseError) {
      setProcessingProductId(null);
      if (isUserCancelledPurchase(purchaseError)) {
        setError(null);
      } else {
        setError(
          purchaseError instanceof Error
            ? purchaseError.message
            : t("billing.google.purchaseFailed"),
        );
      }
    }
  }

  async function restorePurchases() {
    setError(null);
    setRestoring(true);
    try {
      const purchases = await getAvailablePurchasesFromStore();
      const eligible = purchases.filter(
        (purchase) =>
          purchase.store === "google" &&
          Boolean(context?.productIds.includes(purchase.productId)),
      );
      const results = await Promise.all(eligible.map(handleVerifiedPurchase));
      Alert.alert(
        t(
          results.some(Boolean)
            ? "billing.google.restored"
            : "billing.google.nothingToRestore",
        ),
      );
    } catch (restoreError) {
      if (isUserCancelledPurchase(restoreError)) {
        setError(null);
      } else {
        setError(
          restoreError instanceof Error
            ? restoreError.message
            : t("billing.google.purchaseFailed"),
        );
      }
    } finally {
      setRestoring(false);
    }
  }

  if (loadingContext) {
    return (
      <SurfaceCard style={styles.card}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {t("billing.google.storeTitle")}
        </Text>
        <Text style={[styles.meta, { color: theme.muted }]}>
          {t("billing.google.loadingProducts")}
        </Text>
      </SurfaceCard>
    );
  }

  if (!context?.canPurchase) {
    return (
      <SurfaceCard style={styles.card}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {t("billing.google.storeTitle")}
        </Text>
        <Text style={[styles.meta, { color: theme.muted }]}>
          {t("billing.google.ownerOnly")}
        </Text>
      </SurfaceCard>
    );
  }

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.segmentedControl,
          { backgroundColor: theme.cardMuted, borderColor: theme.border },
        ]}
        accessibilityRole="radiogroup"
      >
        {(["MONTHLY", "YEARLY"] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ selected: interval === value }}
            disabled={Boolean(processingProductId) || restoring}
            onPress={() => setInterval(value)}
            style={[
              styles.segment,
              interval === value ? { backgroundColor: theme.primary } : null,
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                {
                  color: interval === value ? theme.primaryText : theme.muted,
                },
              ]}
            >
              {t(value === "MONTHLY" ? "billingMonthly" : "billingYearly")}
            </Text>
          </Pressable>
        ))}
      </View>


      {visibleProducts.length ? (
        visibleProducts.map(({ product, offer }) => {
          const plan = planForProduct(plans, product.id);
          return (
            <SurfaceCard key={`${product.id}:${offer.id}`} style={styles.card}>
              <View style={styles.productHeader}>
                <View style={styles.flexText}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    {plan?.code === "PROFESSIONAL"
                      ? t("planProfessionalName")
                      : t("planStarterName")}
                  </Text>
                  <MobilePlanSeatInfo plan={plan} />
                  <Text style={[styles.price, { color: theme.text }]}>
                    {offer.displayPrice || product.displayPrice}
                  </Text>
                  <Text style={[styles.meta, { color: theme.muted }]}>
                    {t(
                      interval === "MONTHLY" ? "pricePerMonth" : "pricePerYear",
                    )}
                  </Text>
                </View>
                <Ionicons
                  name="logo-google-playstore"
                  size={25}
                  color={theme.text}
                />
              </View>
              <MobilePlanBenefits
                plan={plan}
                fallbackDescription={t("billing.google.storeDescription")}
              />
              <PrimaryButton
                title={t("billing.google.subscribe")}
                icon="card-outline"
                loading={processingProductId === product.id}
                disabled={
                  !connected || Boolean(processingProductId) || restoring
                }
                onPress={() => void startPurchase({ product, offer })}
              />
              <MobilePlanDetailsDisclosure plan={plan} />
            </SurfaceCard>
          );
        })
      ) : (
        <SurfaceCard style={styles.card}>
          <Text style={[styles.meta, { color: theme.muted }]}>
            {connected
              ? t("billing.google.productsUnavailable")
              : t("billing.google.loadingProducts")}
          </Text>
        </SurfaceCard>
      )}

      <Pressable
        disabled={restoring || Boolean(processingProductId)}
        onPress={() => void restorePurchases()}
        style={styles.restoreButton}
      >
        <Ionicons name="refresh-outline" size={19} color={theme.primary} />
        <Text style={[styles.restoreText, { color: theme.primary }]}>
          {t("billing.google.restore")}
        </Text>
      </Pressable>
      <Text style={[styles.disclosure, { color: theme.muted }]}>
        {t("billing.google.renewalDisclosure")}
      </Text>
      <View style={styles.legalLinks}>
        <Text
          style={[styles.legalLink, { color: theme.primary }]}
          onPress={() =>
            void Linking.openURL("https://www.logivya.com/terms-of-service")
          }
        >
          {t("billing.google.terms")}
        </Text>
        <Text
          style={[styles.legalLink, { color: theme.primary }]}
          onPress={() =>
            void Linking.openURL("https://www.logivya.com/privacy-policy")
          }
        >
          {t("billing.google.privacy")}
        </Text>
      </View>
      {error ? (
        <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>
      ) : null}
    </View>
  );
}

function planForProduct(plans: MobilePlanCatalogItem[], productId: string) {
  const slug = productId.includes("professional") ? "professional" : "starter";
  return plans.find((plan) => plan.slug === slug);
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  container: { gap: 14 },
  disclosure: { fontSize: 12, lineHeight: 18, textAlign: "center" },
  error: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    textAlign: "center",
  },
  flexText: { flex: 1 },
  legalLink: { fontSize: 13, fontWeight: "800" },
  legalLinks: { flexDirection: "row", gap: 20, justifyContent: "center" },
  meta: { fontSize: 14, lineHeight: 21 },
  price: { fontSize: 24, fontWeight: "800", marginTop: 6 },
  productHeader: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  restoreButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 44,
  },
  restoreText: { fontSize: 14, fontWeight: "800" },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  segment: {
    alignItems: "center",
    borderRadius: 7,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 10,
  },
  segmentedControl: {
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: 4,
  },
  segmentText: { fontSize: 14, fontWeight: "800" },
});
