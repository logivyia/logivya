import { useCallback, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { Badge, PageHeader, SurfaceCard } from "@/components/ui";
import { AppleSubscriptionStore } from "@/features/subscription/apple-subscription-store";
import { GooglePlaySubscriptionStore } from "@/features/subscription/google-play-subscription-store";
import { MobilePlanBenefits, MobilePlanDetailsDisclosure, MobilePlanSeatInfo } from "@/features/subscription/mobile-plan-benefits";
import { useSubscriptionStore } from "@/features/subscription/subscriptionStore";
import { useTranslation } from "@/i18n/use-translation";
import { formatCurrency, formatDate } from "@/i18n/format";
import { useTheme } from "@/theme/theme-provider";
import type {
  MobileBillingLegalDocument,
  MobileManualSubscriptionRequest,
  MobilePlanCatalogItem,
} from "@/api/mobileSubscription";

export function SubscriptionScreen() {
  const theme = useTheme();
  const { locale, t } = useTranslation();
  const {
    subscription,
    entitlements,
    membershipAccess,
    plans,
    requests,
    draft,
    createdRequest,
    loading,
    requesting,
    error,
    success,
    load,
    createDraft,
    submitDraft,
    cancelRequest,
    dismissDraft,
    dismissCreatedRequest,
  } = useSubscriptionStore();
  const [billingInterval, setBillingInterval] = useState<"MONTHLY" | "YEARLY">(
    "MONTHLY",
  );
  const [acceptedDocuments, setAcceptedDocuments] = useState<
    Record<string, boolean>
  >({});
  const canManageSharedSubscription = Boolean(
    membershipAccess?.capabilities?.["tenant.subscription.manage"],
  );
  const canRequestPersonalPlan = Boolean(
    membershipAccess?.capabilities?.["personal.subscription.request"],
  );
  const canSelectPlan =
    canManageSharedSubscription || canRequestPersonalPlan;
  // External payment instructions stay hidden in store-distributed builds.
  const canPurchaseManualSubscription = false;
  const availablePlans = (Array.isArray(plans) ? plans : []).filter(
    (plan) => !canRequestPersonalPlan || plan.slug !== "trial",
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading && !subscription) {
    return (
      <Screen>
        <LoadingState label={t("loadingSubscription")} />
      </Screen>
    );
  }

  if (error && !subscription) {
    return (
      <Screen>
        <ErrorState title={error} onRetry={load} />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          eyebrow="Logivya"
          title={t("subscription")}
          description={t("subscriptionScreenSubtitle")}
        />

        <SurfaceCard style={styles.card}>
          <View style={styles.currentHeader}>
            <View style={styles.flexText}>
              <Text style={[styles.kicker, { color: theme.muted }]}>
                {t("activePlan")}
              </Text>
              <Text style={[styles.title, { color: theme.text }]}>
                {mobileCurrentPlanName(subscription?.planSlug, t)}
              </Text>
            </View>
            <Badge
              label={subscriptionStatusLabel(
                subscription?.status,
                subscription?.isTrial,
                t,
              )}
              tone={
                subscription?.isTrial
                  ? "warning"
                  : subscription?.isExpired
                    ? "danger"
                    : "success"
              }
            />
          </View>

          {subscription?.isExpired ? (
            <View
              style={[
                styles.lockedNotice,
                {
                  backgroundColor: theme.dangerSoft,
                  borderColor: theme.danger,
                },
              ]}
            >
              <Text style={[styles.noticeTitle, { color: theme.danger }]}>
                {t("readOnlyMode")}
              </Text>
              <Text style={[styles.meta, { color: theme.danger }]}>
                {t("readOnlyModeDescription")}
              </Text>
            </View>
          ) : null}

          <View style={styles.dateGrid}>
            <InfoTile
              label={t("remainingDays")}
              value={t("daysCount", {
                count: Math.max(0, subscription?.remainingDays ?? 0),
              })}
            />
            <InfoTile
              label={t("startDate")}
              value={
                subscription?.startsAt
                  ? formatDate(subscription.startsAt, locale)
                  : "-"
              }
            />
            <InfoTile
              label={t("endDate")}
              value={
                subscription?.endsAt
                  ? formatDate(subscription.endsAt, locale)
                  : "-"
              }
            />
          </View>
        </SurfaceCard>

        {membershipAccess?.sharedAccess ||
        membershipAccess?.sharedAccessExpired ? (
          <SurfaceCard style={styles.card}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {t(
                membershipAccess.sharedAccessExpired
                  ? "sharedSubscriptionExpired"
                  : "sharedSubscription",
              )}
            </Text>
            <Text style={[styles.meta, { color: theme.muted }]}>
              {t(
                membershipAccess.sharedAccessExpired
                  ? "sharedSubscriptionExpiredDescription"
                  : "sharedSubscriptionReadOnly",
              )}
            </Text>
            <InfoRow
              label={t("subscriptionOwner")}
              value={membershipAccess.subscriptionOwner?.name ?? "-"}
            />
            <InfoRow
              label={t("activePlan")}
              value={membershipAccess.plan?.name ?? "-"}
            />
            <InfoRow
              label={t("accountUsage")}
              value={`- / ${membershipAccess.plan?.accountLimit ?? "-"}`}
            />
          </SurfaceCard>
        ) : null}

        {canManageSharedSubscription &&
        entitlements?.trialEligibilityStatus === "PENDING_IDENTITY" ? (
          <SurfaceCard style={styles.card}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {t("trialReadyTitle")}
            </Text>
            <Text style={[styles.meta, { color: theme.muted }]}>
              {t("trialReadyDescription")}
            </Text>
          </SurfaceCard>
        ) : canManageSharedSubscription &&
          entitlements?.trialEligibilityStatus === "INELIGIBLE" ? (
          <SurfaceCard style={styles.card}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {t("trialIneligibleTitle")}
            </Text>
            <Text style={[styles.meta, { color: theme.muted }]}>
              {t("trialIdentityUsedDescription")}
            </Text>
          </SurfaceCard>
        ) : canManageSharedSubscription &&
          entitlements?.trialEligibilityStatus === "BLOCKED" ? (
          <SurfaceCard style={styles.card}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {t("trialReviewTitle")}
            </Text>
            <Text style={[styles.meta, { color: theme.muted }]}>
              {t("trialReviewDescription")}
            </Text>
          </SurfaceCard>
        ) : null}

        {canSelectPlan && canPurchaseManualSubscription ? (
          <View
            style={[
              styles.segmentedControl,
              { backgroundColor: theme.cardMuted, borderColor: theme.border },
            ]}
            accessibilityRole="radiogroup"
          >
            {(["MONTHLY", "YEARLY"] as const).map((interval) => (
              <Pressable
                key={interval}
                accessibilityRole="radio"
                accessibilityState={{ selected: billingInterval === interval }}
                disabled={requesting}
                onPress={() => setBillingInterval(interval)}
                style={[
                  styles.segment,
                  requesting ? { opacity: 0.6 } : null,
                  billingInterval === interval
                    ? { backgroundColor: theme.primary }
                    : null,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    {
                      color:
                        billingInterval === interval
                          ? theme.primaryText
                          : theme.muted,
                    },
                  ]}
                >
                  {t(
                    interval === "MONTHLY"
                      ? "billingMonthly"
                      : "billingYearly",
                  )}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {canPurchaseManualSubscription ? (
          <SurfaceCard style={styles.card}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {t("billing.manual.myRequests")}
            </Text>
            <Text style={[styles.meta, { color: theme.muted }]}>
              {t("billing.manual.requestHistoryDescription")}
            </Text>
            {requests.length ? (
              requests.map((request) => (
                <SubscriptionRequestCard
                  key={request.id}
                  request={request}
                  requesting={requesting}
                  onCancel={() => void cancelRequest(request.id)}
                />
              ))
            ) : (
              <Text style={[styles.meta, { color: theme.muted }]}>
                {t("billing.manual.noRequests")}
              </Text>
            )}
          </SurfaceCard>
        ) : null}

        {canSelectPlan && canPurchaseManualSubscription
          ? availablePlans.map((plan) => {
          const priceMinor =
            plan.slug === "trial"
              ? 0
              : billingInterval === "YEARLY"
                ? plan.yearlyPrice
                : plan.monthlyPrice;
          const upgradePlanSlug =
            plan.slug === "starter" || plan.slug === "professional"
              ? plan.slug
              : null;
          const selected =
            draft?.planCode === plan.code &&
            draft.billingPeriod === billingInterval;
          return (
            <SurfaceCard
              key={plan.code}
              style={[
                styles.card,
                plan.code === "PROFESSIONAL"
                  ? { borderColor: theme.primary }
                  : null,
              ]}
            >
              <View style={styles.currentHeader}>
                <View style={styles.flexText}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    {mobilePlanName(plan.code, t)}
                  </Text>
                  <MobilePlanSeatInfo plan={plan} />
                  <Text style={[styles.planPrice, { color: theme.text }]}>
                    {formatCurrency(priceMinor / 100, plan.currency, locale)}
                  </Text>
                  <Text style={[styles.meta, { color: theme.muted }]}>
                    {plan.slug === "trial"
                      ? t("trialSevenDays")
                      : t(
                          billingInterval === "YEARLY"
                            ? "pricePerYear"
                            : "pricePerMonth",
                        )}
                  </Text>
                  {plan.slug !== "trial" && billingInterval === "YEARLY" ? (
                    <Text style={[styles.equivalent, { color: theme.primary }]}>
                      {t("monthlyEquivalent", {
                        price: formatCurrency(
                          plan.yearlyMonthlyEquivalent / 100,
                          plan.currency,
                          locale,
                        ),
                      })}
                    </Text>
                  ) : null}
                </View>
                {plan.slug === "trial" ? (
                  <Badge label={t("freeBadge")} tone="warning" />
                ) : null}
              </View>
              <MobilePlanBenefits plan={plan} fallbackDescription={t("planStarterDescription")} />
              {upgradePlanSlug ? (
                <PrimaryButton
                  icon="trending-up-outline"
                  title={
                    selected
                      ? t("billing.manual.selected")
                      : t("billing.manual.selectPlan")
                  }
                  loading={requesting}
                  disabled={requesting || selected}
                  onPress={() => {
                    setAcceptedDocuments({});
                    void createDraft(upgradePlanSlug, billingInterval);
                  }}
                />
              ) : null}
              <MobilePlanDetailsDisclosure plan={plan} />
            </SurfaceCard>
          );
            })
          : null}

        {Platform.OS === "ios" && canManageSharedSubscription ? (
          <AppleSubscriptionStore plans={availablePlans} onActivated={load} />
        ) : Platform.OS === "android" && canManageSharedSubscription ? (
          <GooglePlaySubscriptionStore
            plans={availablePlans}
            onActivated={load}
          />
        ) : canSelectPlan && !canPurchaseManualSubscription ? (
          <SurfaceCard style={styles.card}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {t("billing.ios.managedTitle")}
            </Text>
            <Text style={[styles.meta, { color: theme.muted }]}>
              {t("billing.ios.managedDescription")}
            </Text>
          </SurfaceCard>
        ) : null}

        {error ? (
          <Text style={[styles.feedbackText, { color: theme.danger }]}>
            {error}
          </Text>
        ) : null}
        {success ? (
          <Text style={[styles.feedbackText, { color: theme.success }]}>
            {success}
          </Text>
        ) : null}
      </ScrollView>

      <SubscriptionRequestModal
        visible={canPurchaseManualSubscription && Boolean(draft)}
        request={canPurchaseManualSubscription ? draft : null}
        acceptedDocuments={acceptedDocuments}
        requesting={requesting}
        onToggle={(type) =>
          setAcceptedDocuments((current) => ({
            ...current,
            [type]: !current[type],
          }))
        }
        onClose={dismissDraft}
        onSubmit={() => {
          if (!draft) return;
          void submitDraft(
            draft.legalDocuments.map(({ type, version, hash }) => ({
              type,
              version,
              hash,
            })),
          );
        }}
      />
      <SubscriptionRequestSuccessModal
        request={canPurchaseManualSubscription ? createdRequest : null}
        visible={
          canPurchaseManualSubscription && Boolean(createdRequest)
        }
        onClose={dismissCreatedRequest}
      />
    </Screen>
  );
}

function SubscriptionRequestCard({
  request,
  requesting,
  onCancel,
}: {
  request: MobileManualSubscriptionRequest;
  requesting: boolean;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const { locale, t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <View
      style={[
        styles.requestCard,
        { backgroundColor: theme.cardMuted, borderColor: theme.border },
      ]}
    >
      <View style={styles.currentHeader}>
        <View style={styles.flexText}>
          <Text style={[styles.requestTitle, { color: theme.text }]}>
            {request.planName}
          </Text>
          <Text style={[styles.meta, { color: theme.muted }]}>
            {t(
              request.billingPeriod === "YEARLY"
                ? "billingYearly"
                : "billingMonthly",
            )} ·{" "}
            {formatCurrency(Number(request.amount), request.currency, locale)}
          </Text>
        </View>
        <Badge
          label={subscriptionRequestStatusLabel(request.status, t)}
          tone={request.status === "APPROVED" ? "success" : "warning"}
        />
      </View>
      <Text style={[styles.reference, { color: theme.text }]}>
        {t("billing.manual.paymentReference")}: {request.transferDescription}
      </Text>
      {request.adminCustomerNote ? (
        <Text style={[styles.meta, { color: theme.muted }]}>
          {request.adminCustomerNote}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => setExpanded((value) => !value)}
        style={[styles.secondaryButton, { borderColor: theme.border }]}
      >
        <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
          {t("billing.manual.viewPaymentDetails")}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={styles.expandedRequest}>
          <CopyRow
            label={t("billing.manual.accountHolder")}
            value={request.bank.accountHolder}
          />
          <CopyRow
            label={t("billing.manual.bankName")}
            value={request.bank.bankName}
          />
          <CopyRow
            label="IBAN"
            value={request.bank.ibanDisplay}
            copyValue={request.bank.ibanNormalized}
          />
          <CopyRow
            label={t("billing.manual.paymentReference")}
            value={request.transferDescription}
          />
          <CopyRow
            label={t("billing.manual.amount")}
            value={`${request.amount} ${request.currency}`}
          />
          {request.legalDocuments.map((document) => (
            <View
              key={`${request.id}-${document.type}`}
              style={[
                styles.legalSnapshot,
                { borderColor: theme.border, backgroundColor: theme.card },
              ]}
            >
              <Text style={[styles.requestTitle, { color: theme.text }]}>
                {billingLegalDocumentTitle(document.type, t)}
              </Text>
              <Text style={[styles.meta, { color: theme.muted }]}>
                {document.version}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {request.canCancel ? (
        <Pressable
          accessibilityRole="button"
          disabled={requesting}
          onPress={onCancel}
          style={[
            styles.secondaryButton,
            { borderColor: theme.border, opacity: requesting ? 0.5 : 1 },
          ]}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.danger }]}>
            {t("billing.manual.cancelRequest")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SubscriptionRequestModal({
  visible,
  request,
  acceptedDocuments,
  requesting,
  onToggle,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  request: MobileManualSubscriptionRequest | null;
  acceptedDocuments: Record<string, boolean>;
  requesting: boolean;
  onToggle: (type: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const theme = useTheme();
  const { locale, t } = useTranslation();
  const [selectedDocument, setSelectedDocument] =
    useState<MobileBillingLegalDocument | null>(null);
  if (!request) return null;
  const allAccepted =
    request.legalDocuments.length === 3 && Boolean(acceptedDocuments.ALL);

  function closeRequest() {
    setSelectedDocument(null);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closeRequest}
    >
      <SafeAreaView
        edges={["top", "right", "bottom", "left"]}
        style={[styles.modalRoot, { backgroundColor: theme.background }]}
      >
        <View
          style={[styles.modalHeader, { borderBottomColor: theme.border }]}
        >
          <View style={styles.flexText}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {t("billing.manual.consentTitle")}
            </Text>
            <Text style={[styles.meta, { color: theme.muted }]}>
              {t("billing.manual.consentDescription")}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("billing.manual.close")}
            onPress={closeRequest}
            style={[styles.iconButton, { borderColor: theme.border }]}
          >
            <Ionicons name="close" size={22} color={theme.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <SurfaceCard style={styles.card}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {t("billing.manual.orderSummary")}
            </Text>
            <InfoRow
              label={t("billing.manual.serviceProvider")}
              value={request.seller?.officialName || "LOGIVYA"}
            />
            <InfoRow
              label={t("billing.manual.plan")}
              value={request.planName}
            />
            <InfoRow
              label={t("billing.manual.paymentPeriod")}
              value={t(
                request.billingPeriod === "YEARLY"
                  ? "billingYearly"
                  : "billingMonthly",
              )}
            />
            <InfoRow
              label={t("billing.manual.amount")}
              value={formatCurrency(
                Number(request.amount),
                request.currency,
                locale,
              )}
            />
            <InfoRow
              label={t("billing.manual.account")}
              value={String(request.planSnapshot.accountLimit ?? "-")}
            />
            <InfoRow
              label={t("billing.manual.brandingSignature")}
              value={
                request.planSnapshot.features?.brandingFooter
                  ? t("billing.manual.brandingVisible")
                  : t("billing.manual.brandingHidden")
              }
            />
          </SurfaceCard>

          <SurfaceCard style={styles.card}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {t("billing.manual.purchaserInfo")}
            </Text>
            <InfoRow
              label={t("billing.manual.nameTitle")}
              value={
                request.buyerSnapshot.name ||
                t("billing.manual.unspecified")
              }
            />
            <InfoRow
              label={t("billing.manual.email")}
              value={
                request.buyerSnapshot.email ||
                t("billing.manual.unspecified")
              }
            />
            {request.buyerSnapshot.phone ? (
              <InfoRow
                label={t("billing.manual.phone")}
                value={request.buyerSnapshot.phone}
              />
            ) : null}
            {request.buyerSnapshot.address ? (
              <InfoRow
                label={t("billing.manual.address")}
                value={request.buyerSnapshot.address}
              />
            ) : null}
          </SurfaceCard>

          <View
            style={[
              styles.consentRow,
              {
                borderColor: allAccepted ? theme.primary : theme.border,
                backgroundColor: allAccepted ? theme.badge : theme.cardMuted,
              },
            ]}
          >
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allAccepted }}
              accessibilityLabel={t("billing.manual.consentText")}
              hitSlop={10}
              onPress={() => onToggle("ALL")}
              style={styles.checkboxButton}
            >
              <Ionicons
                name={allAccepted ? "checkbox" : "square-outline"}
                size={26}
                color={allAccepted ? theme.primary : theme.muted}
              />
            </Pressable>
            <MobileLegalConsentSentence
              documents={request.legalDocuments}
              onOpen={setSelectedDocument}
            />
          </View>

          <PrimaryButton
            icon="checkmark-circle-outline"
            title={t("billing.manual.purchase")}
            loading={requesting}
            disabled={requesting || !allAccepted}
            onPress={onSubmit}
          />
        </ScrollView>
        <MobileBillingLegalDocumentModal
          document={selectedDocument}
          onClose={() => setSelectedDocument(null)}
        />
      </SafeAreaView>
    </Modal>
  );
}

function MobileLegalConsentSentence({
  documents,
  onOpen,
}: {
  documents: MobileBillingLegalDocument[];
  onOpen: (document: MobileBillingLegalDocument) => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const documentsByLabel = new Map(
    documents.map((document) => [
      billingLegalDocumentTitle(document.type, t),
      document,
    ]),
  );
  const labels = [...documentsByLabel.keys()].sort(
    (left, right) => right.length - left.length,
  );
  const parts = labels.length
    ? t("billing.manual.consentText").split(
        new RegExp(`(${labels.map(escapeRegExp).join("|")})`, "g"),
      )
    : [t("billing.manual.consentText")];

  return (
    <Text style={[styles.consentText, { color: theme.text }]}>
      {parts.map((part, index) => {
        const document = documentsByLabel.get(part);
        return document ? (
          <Text
            key={`${document.type}-${index}`}
            accessibilityRole="link"
            onPress={() => onOpen(document)}
            style={[styles.legalDocumentLink, { color: theme.primary }]}
          >
            {part}
          </Text>
        ) : (
          <Text key={`${part}-${index}`}>{part}</Text>
        );
      })}
    </Text>
  );
}

function MobileBillingLegalDocumentModal({
  document,
  onClose,
}: {
  document: MobileBillingLegalDocument | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Modal
      visible={Boolean(document)}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView
        edges={["top", "right", "bottom", "left"]}
        style={[styles.modalRoot, { backgroundColor: theme.background }]}
      >
        <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
          <View style={styles.flexText}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {document
                ? billingLegalDocumentTitle(document.type, t)
                : t("billing.manual.legalDocuments")}
            </Text>
            {document ? (
              <Text style={[styles.meta, { color: theme.muted }]}>
                {document.version}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("billing.manual.close")}
            onPress={onClose}
            style={[styles.iconButton, { borderColor: theme.border }]}
          >
            <Ionicons name="close" size={22} color={theme.text} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.legalDocumentContent}
          showsVerticalScrollIndicator
        >
          <Text style={[styles.legalContent, { color: theme.text }]}>
            {document?.content ?? ""}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function SubscriptionRequestSuccessModal({
  request,
  visible,
  onClose,
}: {
  request: MobileManualSubscriptionRequest | null;
  visible: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { locale, t } = useTranslation();
  if (!request) return null;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        edges={["top", "right", "bottom", "left"]}
        style={[styles.modalRoot, { backgroundColor: theme.background }]}
      >
        <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
          <View style={styles.flexText}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {t("billing.manual.requestCreatedTitle")}
            </Text>
            <Text style={[styles.meta, { color: theme.muted }]}>
              {t("billing.manual.requestCreatedDescription")}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("billing.manual.close")}
            onPress={onClose}
            style={[styles.iconButton, { borderColor: theme.border }]}
          >
            <Ionicons name="close" size={22} color={theme.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <SurfaceCard style={styles.card}>
            <InfoRow
              label={t("billing.manual.serviceProvider")}
              value={request.seller?.officialName || "LOGIVYA"}
            />
            <InfoRow
              label={t("billing.manual.plan")}
              value={request.planName}
            />
            <InfoRow
              label={t("billing.manual.paymentPeriod")}
              value={t(
                request.billingPeriod === "YEARLY"
                  ? "billingYearly"
                  : "billingMonthly",
              )}
            />
            <InfoRow
              label={t("billing.manual.amount")}
              value={formatCurrency(Number(request.amount), request.currency, locale)}
            />
            <InfoRow
              label={t("billing.manual.status")}
              value={t("billing.manual.pendingPayment")}
            />
            <InfoRow
              label={t("billing.manual.requestDate")}
              value={formatDate(request.createdAt, locale)}
            />
          </SurfaceCard>
          <SurfaceCard style={styles.card}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {t("billing.manual.transferDetails")}
            </Text>
            <CopyRow
              label={t("billing.manual.bankName")}
              value={request.bank.bankName}
            />
            <CopyRow
              label={t("billing.manual.accountHolder")}
              value={request.bank.accountHolder}
            />
            <CopyRow
              label="IBAN"
              value={request.bank.ibanDisplay}
              copyValue={request.bank.ibanNormalized}
            />
            <CopyRow
              label={t("billing.manual.paymentReference")}
              value={request.transferDescription}
            />
            <Text style={[styles.warningText, { color: theme.warning }]}>
              {t("billing.manual.transferInstruction")}
            </Text>
          </SurfaceCard>
          <PrimaryButton title={t("billing.manual.close")} onPress={onClose} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoRowLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.infoRowValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

function CopyRow({
  label,
  value,
  copyValue = value,
}: {
  label: string;
  value: string;
  copyValue?: string;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t("billing.manual.copy")}: ${label}`}
      onPress={() => void Clipboard.setStringAsync(copyValue)}
      style={[styles.copyRow, { borderColor: theme.border }]}
    >
      <View style={styles.flexText}>
        <Text style={[styles.infoRowLabel, { color: theme.muted }]}>
          {label}
        </Text>
        <Text style={[styles.infoRowValue, { color: theme.text }]}>
          {value}
        </Text>
      </View>
      <Ionicons name="copy-outline" size={20} color={theme.primary} />
    </Pressable>
  );
}

function billingLegalDocumentTitle(
  type: MobileBillingLegalDocument["type"],
  t: ReturnType<typeof useTranslation>["t"],
) {
  const key = {
    PRE_INFORMATION_FORM: "billing.manual.preInformationForm",
    DISTANCE_SALES_AGREEMENT: "billing.manual.distanceSalesAgreement",
    REFUND_WITHDRAWAL_POLICY: "billing.manual.refundPolicy",
  } as const;
  return t(key[type]);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function subscriptionRequestStatusLabel(
  status: string,
  t: ReturnType<typeof useTranslation>["t"],
) {
  const labels: Record<string, string> = {
    PENDING_PAYMENT: t("billing.manual.pendingPayment"),
    PAYMENT_REVIEW: t("billing.manual.paymentReview"),
    DRAFT: "Taslak",
    AWAITING_PAYMENT: "Ödeme Bekliyor",
    UNDER_REVIEW: "İnceleniyor",
    APPROVED: t("billing.manual.approved"),
    ACTIVATED: "Etkinleştirildi",
    CLARIFICATION_REQUIRED: "Ek Bilgi Gerekiyor",
    REJECTED: t("billing.manual.rejected"),
    CANCELLED: "İptal Edildi",
    EXPIRED: "Süresi Doldu",
  };
  return labels[status] || status;
}

function mobilePlanName(
  code: MobilePlanCatalogItem["code"],
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (code === "TRIAL") return t("planTrialName");
  if (code === "STARTER") return t("planStarterName");
  return t("planProfessionalName");
}

function mobileCurrentPlanName(
  slug: string | null | undefined,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (slug === "starter") return t("planStarterName");
  if (slug === "professional") return t("planProfessionalName");
  return t("planTrialName");
}

function InfoTile({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.infoTile,
        { backgroundColor: theme.cardMuted, borderColor: theme.border },
      ]}
    >
      <Text style={[styles.infoLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

function subscriptionStatusLabel(
  status: string | undefined,
  isTrial: boolean | undefined,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (isTrial || status === "TRIALING") return t("subscriptionTrial");
  if (status === "ACTIVE") return t("subscriptionActive");
  if (status === "SUSPENDED") return t("subscriptionSuspended");
  if (status === "CANCELED" || status === "CANCELLED")
    return t("subscriptionCancelled");
  if (status === "EXPIRED" || status === "PAST_DUE")
    return t("subscriptionExpired");
  return t("unknown");
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  content: { gap: 14, paddingBottom: 48 },
  card: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 12 },
  currentHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  flexText: { flex: 1, gap: 6, minWidth: 0 },
  kicker: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  title: { fontSize: 30, fontWeight: "900" },
  meta: { fontSize: 14, lineHeight: 21 },
  sectionTitle: { fontSize: 18, fontWeight: "900" },
  dateGrid: { gap: 10 },
  infoTile: { borderRadius: 16, borderWidth: 1, gap: 4, padding: 12 },
  infoLabel: { fontSize: 12, fontWeight: "800" },
  infoValue: { fontSize: 16, fontWeight: "900" },
  lockedNotice: { borderRadius: 16, borderWidth: 1, gap: 6, padding: 12 },
  noticeTitle: { fontSize: 14, fontWeight: "900" },
  feedbackText: { fontSize: 14, fontWeight: "900", lineHeight: 20 },
  segmentedControl: {
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    padding: 4,
  },
  segment: {
    alignItems: "center",
    borderRadius: 9,
    flex: 1,
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  segmentText: { fontSize: 14, fontWeight: "900" },
  planPrice: { fontSize: 28, fontWeight: "900" },
  equivalent: { fontSize: 13, fontWeight: "900", lineHeight: 18 },
  featureList: { gap: 10 },
  featureRow: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  featureText: { flex: 1, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  requestCard: { borderRadius: 16, borderWidth: 1, gap: 10, padding: 14 },
  requestTitle: { fontSize: 16, fontWeight: "900" },
  reference: { fontSize: 13, fontWeight: "900" },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryButtonText: { fontSize: 14, fontWeight: "900" },
  modalRoot: { flex: 1 },
  modalHeader: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  modalContent: { gap: 14, padding: 18, paddingBottom: 48 },
  iconButton: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  infoRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  infoRowLabel: { flexShrink: 0, fontSize: 12, fontWeight: "800" },
  infoRowValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 20,
    textAlign: "right",
  },
  copyRow: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 54,
    padding: 12,
  },
  warningText: { fontSize: 13, fontWeight: "800", lineHeight: 20 },
  legalContent: { fontSize: 14, lineHeight: 23 },
  legalDocumentContent: { padding: 18, paddingBottom: 48 },
  legalDocumentLink: {
    fontWeight: "900",
    textDecorationLine: "underline",
  },
  consentRow: {
    alignItems: "flex-start",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 13,
  },
  checkboxButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 36,
  },
  consentText: { flex: 1, fontSize: 14, fontWeight: "800", lineHeight: 20 },
  expandedRequest: { gap: 10 },
  legalSnapshot: { borderRadius: 12, borderWidth: 1, gap: 8, padding: 12 },
});
