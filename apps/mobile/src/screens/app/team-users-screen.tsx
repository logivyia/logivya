import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  deleteMobileTeamUser,
  getMobileTeamUsers,
  inviteMobileTeamUser,
  revokeMobileTeamInvitation,
  updateMobileTeamUser,
  type InviteTeamUserInput,
  type MobileCompanyInvitation,
  type MobileTeamUser,
  type TeamSeatUsage,
  type TeamUserRole,
  type TeamUserStatus,
} from "@/api/mobileTeam";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { Badge, PageHeader, SectionTitle, SurfaceCard } from "@/components/ui";
import { localeMetadata } from "@/i18n/config";
import { formatDate, formatDateTime } from "@/i18n/format";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

type Notice = { type: "success" | "error"; text: string } | null;
type IssuedInvitation = { inviteCode: string; acceptUrl: string; emailSent: boolean };

const inviteRoles: InviteTeamUserInput["role"][] = ["OPERATOR", "ADMIN", "VIEWER"];
const memberRoles: TeamUserRole[] = ["ADMIN", "OPERATOR", "VIEWER"];
const memberStatuses: TeamUserStatus[] = ["ACTIVE", "SUSPENDED"];

export function TeamUsersScreen() {
  const theme = useTheme();
  const { locale, t } = useTranslation();
  const [users, setUsers] = useState<MobileTeamUser[]>([]);
  const [invitations, setInvitations] = useState<MobileCompanyInvitation[]>([]);
  const [seatUsage, setSeatUsage] = useState<TeamSeatUsage | null>(null);
  const [invite, setInvite] = useState<InviteTeamUserInput>({ name: "", email: "", role: "OPERATOR" });
  const [notice, setNotice] = useState<Notice>(null);
  const [issuedInvitation, setIssuedInvitation] = useState<IssuedInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const summary = useMemo(() => {
    const active = users.filter((item) => item.status === "ACTIVE").length;
    const invited = users.filter((item) => item.status === "INVITED").length;
    return { active, invited, total: users.length };
  }, [users]);
  const roleLabel = (role: TeamUserRole) => ({
    OWNER: t("roleOwner"),
    ADMIN: t("roleAdmin"),
    OPERATOR: t("roleOperator"),
    VIEWER: t("roleViewer"),
  })[role];
  const statusLabel = (status: TeamUserStatus) => ({
    ACTIVE: t("memberStatusActive"),
    INVITED: t("memberStatusInvited"),
    SUSPENDED: t("memberStatusSuspended"),
  })[status];

  async function load(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    setNotice(null);

    try {
      const result = await getMobileTeamUsers();
      setUsers(result.users);
      setInvitations(result.invitations ?? []);
      setSeatUsage(result.seatUsage ?? null);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("usersLoading") });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleInvite() {
    const input = { name: invite.name.trim(), email: invite.email.trim().toLowerCase(), role: invite.role };
    if (!input.name || !input.email) {
      setNotice({ type: "error", text: t("nameEmailRequired") });
      return;
    }

    setSavingKey("invite");
    try {
      const result = await inviteMobileTeamUser(input);
      setInvite({ name: "", email: "", role: "OPERATOR" });
      setIssuedInvitation({ inviteCode: result.inviteCode, acceptUrl: result.acceptUrl, emailSent: result.emailSent });
      setNotice({ type: "success", text: t("userInviteCreated") });
      await load("refresh");
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("invitationFailed") });
    } finally {
      setSavingKey(null);
    }
  }

  async function copyInvitation(value: string, label: string) {
    try {
      await Clipboard.setStringAsync(value);
      setNotice({ type: "success", text: t("copiedToClipboard", { label }) });
    } catch {
      setNotice({ type: "error", text: t("copyFailed", { label }) });
    }
  }

  async function patchMember(id: string, input: Parameters<typeof updateMobileTeamUser>[1], successText = t("userUpdated")) {
    setSavingKey(id);
    try {
      await updateMobileTeamUser(id, input);
      setNotice({ type: "success", text: successText });
      await load("refresh");
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("userUpdateFailed") });
    } finally {
      setSavingKey(null);
    }
  }

  function confirmRemove(member: MobileTeamUser) {
    Alert.alert(t("removeUser"), t("removeUserConfirm", { email: member.user.email }), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("remove"),
        style: "destructive",
        onPress: () => {
          setSavingKey(member.id);
          deleteMobileTeamUser(member.id)
            .then(() => {
              setNotice({ type: "success", text: t("userAccessRemoved") });
              return load("refresh");
            })
            .catch((error) => setNotice({ type: "error", text: error instanceof Error ? error.message : t("userRemoveFailed") }))
            .finally(() => setSavingKey(null));
        },
      },
    ]);
  }

  function confirmRevoke(invitation: MobileCompanyInvitation) {
    Alert.alert(t("revokeInvitation"), t("revokeInvitationConfirm", { email: invitation.email }), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("revokeInvitation"),
        style: "destructive",
        onPress: () => {
          setSavingKey(invitation.id);
          revokeMobileTeamInvitation(invitation.id)
            .then(() => load("refresh"))
            .then(() => setNotice({ type: "success", text: t("invitationRevoked") }))
            .catch((error) => setNotice({ type: "error", text: error instanceof Error ? error.message : t("invitationRevokeFailed") }))
            .finally(() => setSavingKey(null));
        },
      },
    ]);
  }

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          <PageHeader
            eyebrow={t("teamAccess")}
            title={t("users")}
            description={t("teamUsersSubtitle")}
            right={<Badge label={seatUsage ? t("seatsCount", { used: seatUsage.used, limit: seatUsage.limit }) : t("activeCount", { active: summary.active, total: summary.total })} tone="success" />}
          />

          {notice ? (
            <View
              style={[
                styles.notice,
                {
                  backgroundColor: notice.type === "success" ? theme.successSoft : theme.dangerSoft,
                  borderColor: notice.type === "success" ? theme.success : theme.danger,
                },
              ]}
            >
              <Text style={[styles.noticeText, { color: notice.type === "success" ? theme.success : theme.danger }]}>{notice.text}</Text>
            </View>
          ) : null}

          <View style={styles.summaryGrid}>
            <SummaryPill label={t("total")} value={summary.total} />
            <SummaryPill label={t("active")} value={summary.active} />
            <SummaryPill label={t("invited")} value={summary.invited} />
          </View>

          <SurfaceCard style={styles.inviteCard}>
            <SectionTitle title={t("newUserInvite")} />
            <TextField label={t("fullName")} value={invite.name} placeholder={t("teamMemberNamePlaceholder")} onChangeText={(name) => setInvite((current) => ({ ...current, name }))} />
            <TextField
              label={t("email")}
              value={invite.email}
              placeholder="ornek@logivya.com"
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={(email) => setInvite((current) => ({ ...current, email }))}
            />
            <View style={styles.optionBlock}>
              <Text style={[styles.optionTitle, { color: theme.text }]}>{t("role")}</Text>
              <View style={styles.options}>
                {inviteRoles.map((role) => (
                  <ChoiceChip key={role} label={roleLabel(role)} active={invite.role === role} onPress={() => setInvite((current) => ({ ...current, role }))} />
                ))}
              </View>
            </View>
            <PrimaryButton title={t("inviteUser")} icon="person-add-outline" loading={savingKey === "invite"} disabled={Boolean(savingKey) || seatUsage?.available === 0} onPress={handleInvite} />
          </SurfaceCard>

          {issuedInvitation ? (
            <SurfaceCard style={styles.inviteCard}>
              <SectionTitle title={t("invitationReady")} />
              <Text style={[styles.helperText, { color: theme.muted }]}>{t("invitationOneTimeNotice")}</Text>
              <CopyInvitationRow label={t("invitationCode")} copyLabel={t("copyValue", { label: t("invitationCode") })} value={issuedInvitation.inviteCode} onCopy={() => void copyInvitation(issuedInvitation.inviteCode, t("invitationCode"))} />
              <CopyInvitationRow label={t("invitationLink")} copyLabel={t("copyValue", { label: t("invitationLink") })} value={issuedInvitation.acceptUrl} onCopy={() => void copyInvitation(issuedInvitation.acceptUrl, t("invitationLink"))} />
              <Text style={[styles.helperText, { color: theme.muted }]}>{t("emailDelivery", { status: issuedInvitation.emailSent ? t("emailSent") : t("emailNotSent") })}</Text>
            </SurfaceCard>
          ) : null}

          {invitations.some((item) => item.status === "PENDING") ? (
            <SurfaceCard style={styles.inviteCard}>
              <SectionTitle title={t("pendingInvitations")} />
              {invitations.filter((item) => item.status === "PENDING").map((item) => (
                <View key={item.id} style={[styles.invitationRow, { borderColor: theme.border }]}>
                  <View style={styles.memberIdentity}>
                    <Text style={[styles.memberName, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={[styles.memberEmail, { color: theme.muted }]} numberOfLines={1}>{item.email}</Text>
                    <Text style={[styles.memberEmail, { color: theme.muted }]}>{t("expiresAt", { date: formatDate(item.expiresAt, locale) })}</Text>
                  </View>
                  <Pressable accessibilityRole="button" disabled={savingKey !== null} onPress={() => confirmRevoke(item)} style={[styles.iconButton, { borderColor: theme.danger, backgroundColor: theme.dangerSoft }]}>
                    <Ionicons name="mail-unread-outline" size={19} color={theme.danger} />
                  </Pressable>
                </View>
              ))}
            </SurfaceCard>
          ) : null}

          <SectionTitle title={t("companyUsers")} />
          {loading ? (
            <SurfaceCard style={styles.loadingCard}>
              <ActivityIndicator color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.muted }]}>{t("usersLoading")}</Text>
            </SurfaceCard>
          ) : (
            <View style={styles.memberList}>
              {users.map((member) => (
                <SurfaceCard key={member.id} style={styles.memberCard}>
                  <View style={styles.memberHeader}>
                    <View style={[styles.avatar, { backgroundColor: theme.badge }]}>
                      <Text style={[styles.avatarText, { color: theme.primary }]}>{member.user.name.trim()[0]?.toLocaleUpperCase(localeMetadata[locale].intlLocale) ?? "L"}</Text>
                    </View>
                    <View style={styles.memberIdentity}>
                      <Text style={[styles.memberName, { color: theme.text }]} numberOfLines={1}>{member.user.name}</Text>
                      <Text style={[styles.memberEmail, { color: theme.muted }]} numberOfLines={1}>{member.user.email}</Text>
                      <Text style={[styles.memberEmail, { color: theme.muted }]}>{lastLoginLabel(member, locale, t)}</Text>
                    </View>
                    <Badge label={statusLabel(member.status)} tone={member.status === "ACTIVE" ? "success" : member.status === "SUSPENDED" ? "danger" : "warning"} />
                  </View>

                  <View style={styles.optionBlock}>
                    <Text style={[styles.optionTitle, { color: theme.text }]}>{t("role")}</Text>
                    <View style={styles.options}>
                      {(member.role === "OWNER" ? ["OWNER" as const] : memberRoles).map((role) => (
                        <ChoiceChip key={role} label={roleLabel(role)} active={member.role === role} disabled={savingKey !== null || member.role === "OWNER"} onPress={() => void patchMember(member.id, { role })} />
                      ))}
                    </View>
                  </View>

                  <View style={styles.optionBlock}>
                    <Text style={[styles.optionTitle, { color: theme.text }]}>{t("memberStatus")}</Text>
                    <View style={styles.options}>
                      {memberStatuses.map((status) => (
                        <ChoiceChip
                          key={status}
                          label={statusLabel(status)}
                          active={member.status === status}
                          disabled={savingKey !== null || member.role === "OWNER"}
                          onPress={() => void patchMember(member.id, { status })}
                        />
                      ))}
                    </View>
                  </View>

                  <View style={styles.memberActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={savingKey !== null || member.role === "OWNER"}
                      onPress={() => confirmRemove(member)}
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        { borderColor: theme.danger, backgroundColor: theme.dangerSoft, opacity: pressed ? 0.78 : 1 },
                      ]}
                    >
                      <Ionicons name="trash-outline" size={18} color={theme.danger} />
                      <Text style={[styles.secondaryText, { color: theme.danger }]}>{t("remove")}</Text>
                    </Pressable>
                  </View>
                </SurfaceCard>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function SummaryPill({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.summaryPill, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.summaryValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: theme.muted }]}>{label}</Text>
    </View>
  );
}

function CopyInvitationRow({ label, copyLabel, value, onCopy }: { label: string; copyLabel: string; value: string; onCopy: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.copyBlock}>
      <Text style={[styles.optionTitle, { color: theme.text }]}>{label}</Text>
      <View style={[styles.copyRow, { borderColor: theme.border, backgroundColor: theme.cardMuted }]}>
        <Text selectable style={[styles.copyValue, { color: theme.text }]}>{value}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={copyLabel} onPress={onCopy} style={[styles.iconButton, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Ionicons name="copy-outline" size={19} color={theme.primary} />
        </Pressable>
      </View>
    </View>
  );
}

function ChoiceChip({ label, active, disabled, onPress }: { label: string; active: boolean; disabled?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceChip,
        {
          backgroundColor: active ? theme.primary : theme.cardMuted,
          borderColor: active ? theme.primary : theme.border,
          opacity: disabled ? 0.55 : pressed ? 0.78 : 1,
        },
      ]}
    >
      <Text style={[styles.choiceText, { color: active ? theme.primaryText : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

function lastLoginLabel(member: MobileTeamUser, locale: ReturnType<typeof useTranslation>["locale"], t: ReturnType<typeof useTranslation>["t"]) {
  const last = member.user.sessions[0]?.lastActiveAt;
  if (!last) return t("noLastLogin");
  return t("lastLoginAt", { date: formatDateTime(last, locale) });
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  keyboard: { flex: 1 },
  content: { gap: 16, paddingBottom: 44 },
  notice: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  noticeText: { fontSize: 14, fontWeight: "800", lineHeight: 20 },
  summaryGrid: { flexDirection: "row", gap: 10 },
  summaryPill: { borderRadius: 18, borderWidth: 1, flex: 1, padding: 14 },
  summaryValue: { fontSize: 22, fontWeight: "900" },
  summaryLabel: { fontSize: 12, fontWeight: "800", marginTop: 4 },
  inviteCard: { gap: 14 },
  helperText: { fontSize: 13, fontWeight: "700", lineHeight: 19 },
  copyBlock: { gap: 8 },
  copyRow: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 10, padding: 10 },
  copyValue: { flex: 1, fontSize: 13, fontWeight: "800", lineHeight: 18 },
  invitationRow: { alignItems: "center", borderTopWidth: 1, flexDirection: "row", gap: 12, paddingTop: 12 },
  iconButton: { alignItems: "center", borderRadius: 14, borderWidth: 1, height: 44, justifyContent: "center", width: 44 },
  loadingCard: { alignItems: "center", gap: 12, paddingVertical: 28 },
  loadingText: { fontSize: 14, fontWeight: "700" },
  memberList: { gap: 14 },
  memberCard: { gap: 14 },
  memberHeader: { alignItems: "center", flexDirection: "row", gap: 12 },
  avatar: { alignItems: "center", borderRadius: 20, height: 40, justifyContent: "center", width: 40 },
  avatarText: { fontSize: 17, fontWeight: "900" },
  memberIdentity: { flex: 1, gap: 3, minWidth: 0 },
  memberName: { fontSize: 17, fontWeight: "900" },
  memberEmail: { fontSize: 12, fontWeight: "700", lineHeight: 17 },
  optionBlock: { gap: 8 },
  optionTitle: { fontSize: 13, fontWeight: "900" },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choiceChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 },
  choiceText: { fontSize: 13, fontWeight: "900" },
  memberActions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  secondaryButton: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 8, minHeight: 48, paddingHorizontal: 14 },
  secondaryText: { fontSize: 14, fontWeight: "900" },
});
