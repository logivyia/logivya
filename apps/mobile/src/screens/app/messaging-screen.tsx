import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";

import { getMobileCategories, type MobileCategory } from "@/api/mobileCategories";
import { getMobileContactDisplayName, getMobileContacts, syncMobileContacts, type MobileWhatsAppContact } from "@/api/mobileContacts";
import { getMobileGroups, type MobileGroup } from "@/api/mobileGroups";
import { createRecurringMobileMessage, scheduleMobileMessage, sendMobileMessage, type MobileMessageResponse } from "@/api/mobileMessages";
import { getMobileSubscription } from "@/api/mobileSubscription";
import { getMobileWhatsAppStatus, type MobileWhatsAppUnifiedStatus } from "@/api/mobileWhatsApp";
import { PrimaryButton } from "@/components/primary-button";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { Badge, PageHeader, SectionTitle, StatCard, SurfaceCard } from "@/components/ui";
import { Screen } from "@/components/screen";
import { localeMetadata } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

type SendMode = "SEND_NOW" | "SCHEDULED" | "RECURRING";
type RecurringFrequency = "DAILY" | "WEEKLY" | "MONTHLY";
type SchedulePickerMode = "date" | "time" | "datetime";
type SuccessStatus = { title: string; message: string } | null;

export function MessagingScreen() {
  const theme = useTheme();
  const { locale, t } = useTranslation();
  const [groups, setGroups] = useState<MobileGroup[]>([]);
  const [categories, setCategories] = useState<MobileCategory[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [contacts, setContacts] = useState<MobileWhatsAppContact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [contactAccess, setContactAccess] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactPageInfo, setContactPageInfo] = useState<{ page: number; limit: number; total: number; totalPages: number; hasMore: boolean } | null>(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<SendMode>("SEND_NOW");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [schedulePickerMode, setSchedulePickerMode] = useState<SchedulePickerMode | null>(null);
  const [recurringFrequency, setRecurringFrequency] = useState<RecurringFrequency>("WEEKLY");
  const [recurringInterval, setRecurringInterval] = useState("1");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SuccessStatus>(null);
  const [whatsAppStatus, setWhatsAppStatus] = useState<MobileWhatsAppUnifiedStatus | null>(null);
  const contactRequestVersionRef = useRef(0);
  const contactLastSyncAtRef = useRef<string | null>(null);

  const loadAudiences = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [groupResponse, categoryResponse, statusResponse, subscriptionResponse] = await Promise.all([
        getMobileGroups({ limit: 100 }),
        getMobileCategories(),
        getMobileWhatsAppStatus().catch(() => null),
        getMobileSubscription(),
      ]);
      setGroups(groupResponse.groups);
      setCategories(categoryResponse.categories);
      setWhatsAppStatus(statusResponse?.status ?? null);
      const canUseContacts = subscriptionResponse.subscription.entitlements.contactMessaging;
      setContactAccess(canUseContacts);
      if (canUseContacts) {
        const requestVersion = ++contactRequestVersionRef.current;
        const contactResponse = await getMobileContacts({ limit: 100 });
        if (requestVersion === contactRequestVersionRef.current) {
          setContacts(contactResponse.contacts);
          setContactPageInfo(contactResponse.pageInfo);
          contactLastSyncAtRef.current = contactResponse.account.lastContactSyncAt;
        }
      } else {
        contactRequestVersionRef.current += 1;
        setContacts([]);
        setSelectedContacts([]);
        setContactPageInfo(null);
        contactLastSyncAtRef.current = null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("audienceLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => {
    void loadAudiences();
  }, [loadAudiences]));

  useEffect(() => {
    if (!contactAccess) {
      contactRequestVersionRef.current += 1;
      setContactLoading(false);
      return;
    }
    const requestVersion = ++contactRequestVersionRef.current;
    const timer = setTimeout(() => {
      setContactLoading(true);
      setContactError(null);
      void getMobileContacts({ limit: 100, search: contactSearch })
        .then((response) => {
          if (requestVersion !== contactRequestVersionRef.current) return;
          setContacts(response.contacts);
          setContactPageInfo(response.pageInfo);
          contactLastSyncAtRef.current = response.account.lastContactSyncAt;
        })
        .catch((err) => {
          if (requestVersion === contactRequestVersionRef.current) {
            setContactError(err instanceof Error ? err.message : t("contactsLoadFailed"));
          }
        })
        .finally(() => {
          if (requestVersion === contactRequestVersionRef.current) setContactLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      if (requestVersion === contactRequestVersionRef.current) contactRequestVersionRef.current += 1;
    };
  }, [contactAccess, contactSearch, t]);

  async function refreshContacts() {
    const requestVersion = ++contactRequestVersionRef.current;
    const previousSyncAt = contactLastSyncAtRef.current;
    setContactLoading(true);
    setContactError(null);
    try {
      const syncRequest = await syncMobileContacts();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const syncState = await getMobileContacts({ limit: 10 });
        if (requestVersion !== contactRequestVersionRef.current) return;
        const currentSyncAt = syncState.account.lastContactSyncAt;
        if (syncState.syncRun?.id === syncRequest.syncRunId && ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(syncState.syncRun.status)) {
          if (syncState.syncRun.status === "FAILED") throw new Error(t("contactsRefreshFailed"));
          break;
        }
        if (currentSyncAt && currentSyncAt !== previousSyncAt) {
          contactLastSyncAtRef.current = currentSyncAt;
          break;
        }
      }
      const response = await getMobileContacts({ limit: 100, search: contactSearch });
      if (requestVersion !== contactRequestVersionRef.current) return;
      setContacts(response.contacts);
      setContactPageInfo(response.pageInfo);
      contactLastSyncAtRef.current = response.account.lastContactSyncAt;
    } catch (err) {
      if (requestVersion === contactRequestVersionRef.current) {
        setContactError(err instanceof Error ? err.message : t("contactsRefreshFailed"));
      }
    } finally {
      if (requestVersion === contactRequestVersionRef.current) setContactLoading(false);
    }
  }

  async function loadMoreContacts() {
    if (!contactPageInfo?.hasMore || contactLoading) return;
    const requestVersion = contactRequestVersionRef.current;
    setContactLoading(true);
    setContactError(null);
    try {
      const response = await getMobileContacts({ page: contactPageInfo.page + 1, limit: contactPageInfo.limit, search: contactSearch });
      if (requestVersion !== contactRequestVersionRef.current) return;
      setContacts((current) => {
        const byId = new Map(current.map((contact) => [contact.id, contact]));
        for (const contact of response.contacts) byId.set(contact.id, contact);
        return [...byId.values()];
      });
      setContactPageInfo(response.pageInfo);
      contactLastSyncAtRef.current = response.account.lastContactSyncAt;
    } catch (err) {
      if (requestVersion === contactRequestVersionRef.current) {
        setContactError(err instanceof Error ? err.message : t("contactsLoadFailed"));
      }
    } finally {
      if (requestVersion === contactRequestVersionRef.current) setContactLoading(false);
    }
  }

  const displayableContacts = useMemo(() => contacts.flatMap((contact) => {
    const displayName = getMobileContactDisplayName(contact);
    return displayName ? [{ contact, displayName }] : [];
  }), [contacts]);

  function toggleVisibleContacts() {
    const visibleIds = displayableContacts.map(({ contact }) => contact.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedContacts.includes(id));
    setSelectedContacts((current) => allVisibleSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : [...new Set([...current, ...visibleIds])]);
  }

  const sendableGroups = useMemo(() => groups.filter((group) => group.canSend), [groups]);
  const filteredGroups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(localeMetadata[locale].intlLocale);
    if (!query) return sendableGroups;
    return sendableGroups.filter((group) => group.name.toLocaleLowerCase(localeMetadata[locale].intlLocale).includes(query));
  }, [locale, search, sendableGroups]);

  const categoryGroupCount = useMemo(
    () => categories.filter((category) => selectedCategories.includes(category.id)).reduce((sum, category) => sum + (category._count?.groups ?? 0), 0),
    [categories, selectedCategories]
  );
  const categoryContactCount = useMemo(
    () => categories.filter((category) => selectedCategories.includes(category.id)).reduce((sum, category) => sum + (category._count?.contacts ?? 0), 0),
    [categories, selectedCategories]
  );
  const estimatedTargets = selectedGroups.length + categoryGroupCount + selectedContacts.length + categoryContactCount;
  const selectedCategoryNames = useMemo(
    () => categories.filter((category) => selectedCategories.includes(category.id)).map((category) => category.name),
    [categories, selectedCategories]
  );
  const targetPreviewTitle = useMemo(() => {
    if (selectedCategoryNames.length) return selectedCategoryNames.join(", ");
    if (selectedGroups.length && selectedContacts.length) return t("selectedGroupsAndContacts");
    if (selectedGroups.length) return t("selectedGroupsOnly");
    if (selectedContacts.length) return t("selectedContactsOnly");
    return t("noTargetSelected");
  }, [selectedCategoryNames, selectedGroups.length, selectedContacts.length, t]);
  const targetPreviewContent = estimatedTargets > 0
    ? t("targetSummary", { count: estimatedTargets, groups: selectedGroups.length + categoryGroupCount, contacts: selectedContacts.length + categoryContactCount })
    : t("targetPrompt");
  const scheduledAtLabel = scheduledAt
    ? formatDateTime(scheduledAt, locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";
  const scheduleButtonDisabled = mode === "SCHEDULED" && !scheduledAt;
  const canSubmit = Boolean(message.trim()) && estimatedTargets > 0 && !scheduleButtonDisabled;

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 3000);
    return () => clearTimeout(timer);
  }, [status]);

  const toggle = (value: string, list: string[], setList: (next: string[]) => void) => {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
    setStatus(null);
  };

  const toggleVisibleGroups = () => {
    const visibleIds = filteredGroups.map((group) => group.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedGroups.includes(id));
    setSelectedGroups(allSelected ? selectedGroups.filter((id) => !visibleIds.includes(id)) : [...new Set([...selectedGroups, ...visibleIds])]);
    setStatus(null);
  };

  const submit = async () => {
    const content = message.trim();
    setStatus(null);
    setError(null);
    const scheduledAtForSubmit = mode === "SCHEDULED" ? scheduledAt : null;

    if (!content) {
      setError(t("messageRequired"));
      return;
    }
    if (!selectedGroups.length && !selectedCategories.length && !selectedContacts.length) {
      setError(t("audienceRequired"));
      return;
    }
    if (mode === "SCHEDULED") {
      if (!scheduledAtForSubmit) {
        setError(t("scheduleRequired"));
        return;
      }
      if (scheduledAtForSubmit.getTime() <= Date.now()) {
        setError(t("schedulePast"));
        return;
      }
    }

    const payload = {
      title: content.slice(0, 60),
      content,
      groupIds: selectedGroups,
      categoryIds: selectedCategories,
      contactIds: selectedContacts
    };

    try {
      setSubmitting(true);
      let response: MobileMessageResponse;
      if (mode === "SCHEDULED") {
        if (!scheduledAtForSubmit) return;
        response = await scheduleMobileMessage({
          ...payload,
          scheduledAt: scheduledAtForSubmit.toISOString(),
          scheduledTimeZone: getDeviceScheduleTimeZone()
        });
      } else if (mode === "RECURRING") {
        response = await createRecurringMobileMessage({
          ...payload,
          recurringRule: { frequency: recurringFrequency, interval: parseRecurringInterval(recurringInterval, t("recurringIntervalValidation")) }
        });
      } else {
        response = await sendMobileMessage(payload);
      }

      setMessage("");
      if (mode === "SCHEDULED") setScheduledAt(null);
      const targetCount = estimatedTargets || response.campaign.totalRecipients;
      setStatus({
        title: t("actionSuccess"),
        message:
          mode === "SCHEDULED"
            ? t("messageScheduled", { count: targetCount })
            : t("messageQueued", { count: targetCount })
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("messageSendFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const openSchedulePicker = () => {
    setStatus(null);
    setError(null);
    setSchedulePickerMode(Platform.OS === "ios" ? "datetime" : "date");
  };

  const handleSchedulePickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === "dismissed") {
      setSchedulePickerMode(null);
      return;
    }
    if (!selectedDate) return;

    if (Platform.OS === "android" && schedulePickerMode === "date") {
      const next = mergeScheduleDateAndTime(selectedDate, scheduledAt ?? getDefaultScheduleDate());
      setScheduledAt(next);
      setSchedulePickerMode(null);
      setTimeout(() => setSchedulePickerMode("time"), 80);
      return;
    }

    const next =
      Platform.OS === "android" && schedulePickerMode === "time"
        ? mergeScheduleDateAndTime(scheduledAt ?? getDefaultScheduleDate(), selectedDate)
        : selectedDate;

    setScheduledAt(next);
    setStatus(null);
    setSchedulePickerMode(Platform.OS === "ios" ? "datetime" : null);
    if (next.getTime() <= Date.now()) {
      setError(t("schedulePast"));
    } else {
      setError(null);
    }
  };

  if (loading) {
    return (
      <Screen>
        <LoadingState label={t("loadingAudiences")} />
      </Screen>
    );
  }

  if (error && !groups.length && !categories.length) {
    return (
      <Screen>
        <ErrorState title={error} onRetry={() => void loadAudiences()} />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboard}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <PageHeader
            eyebrow={t("campaignStudio")}
            title={t("messagingTitle")}
            description={t("messagingSubtitle")}
          />

          <View style={styles.grid}>
            <StatCard icon="people-outline" label={t("selectedTarget")} value={estimatedTargets} />
            <StatCard icon="checkmark-done-outline" label={t("sendableGroup")} value={sendableGroups.length} tone="success" />
            <StatCard icon="albums-outline" label={t("categories")} value={categories.length} />
            <StatCard icon="person-outline" label={t("selectedContact")} value={selectedContacts.length} />
          </View>

          <SurfaceCard style={styles.card}>
            <View style={styles.writeHeader}>
              <SectionTitle title={t("writeMessage")} />
              <Badge label={`${message.length}/4096`} />
            </View>
            <TextInput
              multiline
              maxLength={4096}
              value={message}
              onChangeText={(value) => {
                setMessage(value);
                setStatus(null);
              }}
              placeholder={t("messagePlaceholder")}
              placeholderTextColor={theme.muted}
              style={[styles.textarea, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              textAlignVertical="top"
            />

            <View style={styles.modeRow}>
              <ModeButton active={mode === "SEND_NOW"} label={t("sendNow")} onPress={() => setMode("SEND_NOW")} />
              <ModeButton active={mode === "SCHEDULED"} label={t("scheduleAction")} onPress={() => setMode("SCHEDULED")} />
              <ModeButton active={mode === "RECURRING"} label={t("repeatAction")} onPress={() => setMode("RECURRING")} />
            </View>
            {mode === "SCHEDULED" ? (
              <View style={styles.scheduleBox}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("selectDateTime")}
                  onPress={openSchedulePicker}
                  style={({ pressed }) => [
                    styles.scheduleInput,
                    styles.scheduleInputButton,
                    { borderColor: theme.border, backgroundColor: theme.background, opacity: pressed ? 0.82 : 1 }
                  ]}
                >
                  <Text style={[styles.scheduleInputText, { color: scheduledAt ? theme.text : theme.muted }]}>
                    {scheduledAtLabel || t("selectDateTime")}
                  </Text>
                  <Ionicons name="calendar-outline" size={20} color={theme.primary} />
                </Pressable>
                {schedulePickerMode ? (
                  <DateTimePicker
                    value={scheduledAt ?? getDefaultScheduleDate()}
                    mode={schedulePickerMode === "datetime" ? "datetime" : schedulePickerMode}
                    display={Platform.OS === "ios" ? "compact" : "default"}
                    minimumDate={new Date()}
                    is24Hour
                    locale={localeMetadata[locale].intlLocale}
                    positiveButton={{ label: t("select") }}
                    negativeButton={{ label: t("cancel") }}
                    onChange={handleSchedulePickerChange}
                  />
                ) : null}
              </View>
            ) : null}
            {mode === "RECURRING" ? (
              <View style={styles.recurringBox}>
                <View style={styles.frequencyRow}>
                  <ModeButton active={recurringFrequency === "DAILY"} label={t("daily")} onPress={() => setRecurringFrequency("DAILY")} />
                  <ModeButton active={recurringFrequency === "WEEKLY"} label={t("weekly")} onPress={() => setRecurringFrequency("WEEKLY")} />
                  <ModeButton active={recurringFrequency === "MONTHLY"} label={t("monthly")} onPress={() => setRecurringFrequency("MONTHLY")} />
                </View>
                <TextInput
                  value={recurringInterval}
                  onChangeText={setRecurringInterval}
                  keyboardType="number-pad"
                  placeholder={t("intervalPlaceholder")}
                  placeholderTextColor={theme.muted}
                  style={[styles.scheduleInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                />
              </View>
            ) : null}

            <View style={[styles.preview, { borderColor: theme.border, backgroundColor: theme.badge }]}>
              <Text style={[styles.previewLabel, { color: theme.primary }]}>{t("targetLabel", { value: targetPreviewTitle })}</Text>
              <Text style={[styles.previewText, { color: theme.text }]}>{t("contentLabel", { value: targetPreviewContent })}</Text>
            </View>

            {error ? <Text style={[styles.feedbackText, { color: theme.danger }]}>{error}</Text> : null}
            {status ? (
              <View style={[styles.successBanner, { backgroundColor: theme.successSoft, borderColor: theme.success }]}>
                <Text style={[styles.successTitle, { color: theme.success }]}>{status.title}</Text>
                <Text style={[styles.successMessage, { color: theme.success }]}>{status.message}</Text>
              </View>
            ) : null}
            <PrimaryButton
              icon="send-outline"
              title={mode === "SCHEDULED" ? t("scheduleMessage") : mode === "RECURRING" ? t("createRecurringDelivery") : t("sendMessage")}
              loading={submitting}
              disabled={!canSubmit || submitting}
              onPress={submit}
            />
          </SurfaceCard>

          <SurfaceCard style={styles.card}>
            <SectionTitle title={t("selectAudiences")} />
            <View style={[styles.searchBox, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <Ionicons name="search-outline" size={18} color={theme.muted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t("searchAudience")}
                placeholderTextColor={theme.muted}
                style={[styles.searchInput, { color: theme.text }]}
              />
            </View>

            <Text style={[styles.groupTitle, { color: theme.muted }]}>{t("categories")}</Text>
            {categories.length ? (
              <View style={styles.optionGrid}>
                {categories.map((category) => (
                  <SelectableRow
                    key={category.id}
                    label={category.name}
                    meta={formatCategoryTargetCount(category, t)}
                    selected={selectedCategories.includes(category.id)}
                    onPress={() => toggle(category.id, selectedCategories, setSelectedCategories)}
                  />
                ))}
              </View>
            ) : (
              <Text style={[styles.muted, { color: theme.muted }]}>{t("noCategories")}</Text>
            )}

            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.groupTitle, { color: theme.muted }]}>{t("groups")}</Text>
              <Pressable accessibilityRole="button" onPress={toggleVisibleGroups} style={[styles.smallButton, { borderColor: theme.border }]}>
                <Text style={[styles.smallButtonText, { color: theme.text }]}>{t("selectVisible")}</Text>
              </Pressable>
            </View>
            {filteredGroups.length ? (
              <View style={styles.optionGrid}>
                {filteredGroups.map((group) => (
                  <SelectableRow
                    key={group.id}
                    label={group.name}
                    meta={t("peopleCount", { count: group.participantCount ?? 0 })}
                    selected={selectedGroups.includes(group.id)}
                    onPress={() => toggle(group.id, selectedGroups, setSelectedGroups)}
                  />
                ))}
              </View>
            ) : (
              <EmptyState
                title={t("noSendableGroups")}
                description={whatsAppStatus?.connectedCount || whatsAppStatus?.reconnectingCount ? t("groupsResyncing") : t("connectOrSyncGroups")}
              />
            )}

            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.groupTitle, { color: theme.muted }]}>{t("contacts")}</Text>
              {contactAccess ? (
                <Pressable accessibilityRole="button" disabled={contactLoading} onPress={() => void refreshContacts()} style={[styles.smallButton, { borderColor: theme.border, opacity: contactLoading ? 0.55 : 1 }]}>
                  <Text style={[styles.smallButtonText, { color: theme.text }]}>{t("refreshContacts")}</Text>
                </Pressable>
              ) : null}
            </View>
            {!contactAccess ? (
              <View style={[styles.lockedNotice, { borderColor: theme.border, backgroundColor: theme.badge }]}>
                <Ionicons name="lock-closed-outline" size={20} color={theme.primary} />
                <Text style={[styles.muted, { color: theme.text }]}>{t("professionalContactsRequired")}</Text>
              </View>
            ) : (
              <>
                <View style={[styles.searchBox, { borderColor: theme.border, backgroundColor: theme.card }]}>
                  <Ionicons name="search-outline" size={18} color={theme.muted} />
                  <TextInput
                    value={contactSearch}
                    onChangeText={setContactSearch}
                    placeholder={t("searchContacts")}
                    placeholderTextColor={theme.muted}
                    style={[styles.searchInput, { color: theme.text }]}
                  />
                </View>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: displayableContacts.length > 0 && displayableContacts.every(({ contact }) => selectedContacts.includes(contact.id)) }}
                  onPress={toggleVisibleContacts}
                  style={[styles.selectVisibleRow, { borderColor: theme.border, backgroundColor: theme.card }]}
                >
                  <Ionicons
                    name={displayableContacts.length > 0 && displayableContacts.every(({ contact }) => selectedContacts.includes(contact.id)) ? "checkbox" : "square-outline"}
                    size={21}
                    color={theme.primary}
                  />
                  <Text style={[styles.selectVisibleText, { color: theme.text }]}>{t("selectVisibleContacts")}</Text>
                  <Text style={[styles.selectVisibleCount, { color: theme.muted }]}>{t("selectedCount", { count: selectedContacts.length })}</Text>
                </Pressable>
                {contactError ? <Text style={[styles.feedbackText, { color: theme.danger }]}>{contactError}</Text> : null}
                {!displayableContacts.length && contactLoading ? <Text style={[styles.muted, { color: theme.muted }]}>{t("contactsLoading")}</Text> : displayableContacts.length ? (
                  <View style={styles.optionGrid}>
                    {displayableContacts.map(({ contact, displayName }) => (
                      <SelectableRow
                        key={contact.id}
                        label={displayName}
                        meta={`+${contact.phone}`}
                        selected={selectedContacts.includes(contact.id)}
                        onPress={() => toggle(contact.id, selectedContacts, setSelectedContacts)}
                      />
                    ))}
                  </View>
                ) : (
                  <EmptyState title={t("noContactsInAccount")} description={t("noContactsInAccountDescription")} />
                )}
                {contactPageInfo?.hasMore ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={contactLoading}
                    onPress={() => void loadMoreContacts()}
                    style={[styles.loadMoreButton, { borderColor: theme.border, opacity: contactLoading ? 0.55 : 1 }]}
                  >
                    <Text style={[styles.smallButtonText, { color: theme.text }]}>{contactLoading ? t("contactsLoading") : t("loadMoreContacts")}</Text>
                  </Pressable>
                ) : null}
                <Text style={[styles.complianceText, { color: theme.muted }]}>{t("messagingCompliance")}</Text>
              </>
            )}
          </SurfaceCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function formatCategoryTargetCount(category: MobileCategory, t: ReturnType<typeof useTranslation>["t"]) {
  const groups = category.assignedGroupCount ?? category._count?.groups ?? 0;
  const contacts = category.assignedContactCount ?? category._count?.contacts ?? 0;
  if (groups && contacts) return `${t("groupMetric", { count: groups })} · ${t("contactMetric", { count: contacts })}`;
  if (groups) return t("groupMetric", { count: groups });
  if (contacts) return t("contactMetric", { count: contacts });
  return t("noAssignedAudience");
}

function SelectableRow({ label, meta, selected, onPress }: { label: string; meta: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectable,
        { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.badge : theme.card, opacity: pressed ? 0.78 : 1 }
      ]}
    >
      <Ionicons name={selected ? "checkbox" : "square-outline"} size={21} color={selected ? theme.primary : theme.muted} />
      <Text style={[styles.selectableLabel, { color: theme.text }]} numberOfLines={2}>{label}</Text>
      <Text style={[styles.selectableMeta, { color: theme.muted }]}>{meta}</Text>
    </Pressable>
  );
}

function ModeButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.modeButton, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.card }]}
    >
      <Text style={[styles.modeButtonText, { color: active ? theme.primaryText : theme.text }]} numberOfLines={2} adjustsFontSizeToFit>
        {label}
      </Text>
    </Pressable>
  );
}

function getDeviceScheduleTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Istanbul";
  } catch {
    return "Europe/Istanbul";
  }
}

function getDefaultScheduleDate() {
  const next = new Date();
  next.setMinutes(next.getMinutes() + 30);
  next.setSeconds(0, 0);
  return next;
}

function mergeScheduleDateAndTime(datePart: Date, timePart: Date) {
  const merged = new Date(datePart);
  merged.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0);
  return merged;
}

function parseRecurringInterval(value: string, errorMessage: string) {
  const parsed = Number(value.trim() || "1");
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) throw new Error(errorMessage);
  return parsed;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  keyboard: { flex: 1 },
  content: { gap: 16, paddingBottom: 42 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: { gap: 14 },
  searchBox: { alignItems: "center", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 54, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 15, minHeight: 50 },
  groupTitle: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  muted: { fontSize: 14, fontWeight: "700" },
  optionGrid: { gap: 9 },
  sectionHeaderRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 12 },
  smallButton: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  smallButtonText: { fontSize: 12, fontWeight: "900" },
  selectable: { alignItems: "center", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 54, paddingHorizontal: 13, paddingVertical: 10 },
  selectableLabel: { flex: 1, fontSize: 15, fontWeight: "900", lineHeight: 20 },
  selectableMeta: { fontSize: 12, fontWeight: "800" },
  writeHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 12 },
  textarea: { borderRadius: 18, borderWidth: 1, fontSize: 16, lineHeight: 22, minHeight: 180, padding: 14 },
  modeRow: { flexDirection: "row", gap: 8 },
  modeButton: { alignItems: "center", borderRadius: 14, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 48, minWidth: 0, paddingHorizontal: 8 },
  modeButtonText: { fontSize: 13, fontWeight: "900", lineHeight: 16, textAlign: "center" },
  scheduleBox: { gap: 10 },
  scheduleInput: { borderRadius: 14, borderWidth: 1, fontSize: 16, minHeight: 52, paddingHorizontal: 14 },
  scheduleInputButton: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between", paddingVertical: 13 },
  scheduleInputText: { flex: 1, fontSize: 16, fontWeight: "800", lineHeight: 22 },
  recurringBox: { gap: 10 },
  frequencyRow: { flexDirection: "row", gap: 8 },
  preview: { borderRadius: 18, borderWidth: 1, gap: 8, padding: 14 },
  previewLabel: { fontSize: 13, fontWeight: "900" },
  previewText: { fontSize: 15, fontWeight: "700", lineHeight: 22 },
  successBanner: { borderRadius: 18, borderWidth: 1, gap: 4, padding: 14 },
  successTitle: { fontSize: 15, fontWeight: "900" },
  successMessage: { fontSize: 14, fontWeight: "800", lineHeight: 20 },
  feedbackText: { fontSize: 14, fontWeight: "900", lineHeight: 20 },
  lockedNotice: { alignItems: "center", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 10, padding: 14 },
  complianceText: { fontSize: 12, fontWeight: "700", lineHeight: 18 },
  selectVisibleRow: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 50, paddingHorizontal: 13 },
  selectVisibleText: { flex: 1, fontSize: 14, fontWeight: "800" },
  selectVisibleCount: { fontSize: 12, fontWeight: "800" },
  loadMoreButton: { alignItems: "center", borderRadius: 14, borderWidth: 1, minHeight: 46, justifyContent: "center", paddingHorizontal: 14 }
});
