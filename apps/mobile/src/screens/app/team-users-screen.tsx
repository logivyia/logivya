import { Ionicons } from "@expo/vector-icons";
import { MIN_PASSWORD_LENGTH } from "@logivya/validation/password-policy";
import { useEffect, useMemo, useState, type ComponentProps } from "react";
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
  createMobileTeamUser,
  deleteMobileTeamUser,
  getMobileTeamUsers,
  MobileTeamDataContractError,
  resetMobileTeamUserTemporaryPassword,
  type CreateTeamUserInput,
  type MobileTeamUser,
  type TeamSeatUsage,
} from "@/api/mobileTeam";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { Badge, PageHeader, SectionTitle, SurfaceCard } from "@/components/ui";
import { localeMetadata } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

type Notice = { type: "success" | "error"; text: string } | null;

const emptyCreateInput: CreateTeamUserInput = {
  firstName: "",
  lastName: "",
  email: "",
  temporaryPassword: "",
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function TeamUsersScreen() {
  const theme = useTheme();
  const { locale, t } = useTranslation();
  const [users, setUsers] = useState<MobileTeamUser[]>([]);
  const [seatUsage, setSeatUsage] = useState<TeamSeatUsage | null>(null);
  const [createInput, setCreateInput] = useState<CreateTeamUserInput>(emptyCreateInput);
  const [resetTarget, setResetTarget] = useState<MobileTeamUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [permissions, setPermissions] = useState({
    canCreateUsers: false,
    canRemoveUsers: false,
    canResetTemporaryPasswords: false,
  });

  const accountSummary = useMemo(() => {
    if (!seatUsage) return "";
    return t("accountsUsed", { used: seatUsage.used, limit: seatUsage.limit });
  }, [seatUsage, t]);

  async function load(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    try {
      const result = await getMobileTeamUsers();
      setUsers(result.users);
      setSeatUsage(result.seatUsage ?? null);
      setPermissions(result.requesterPermissions);
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof MobileTeamDataContractError
          ? t("operationFailedError")
          : error instanceof Error
            ? error.message
            : t("operationFailedError"),
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreateUser() {
    const input = {
      firstName: createInput.firstName.trim(),
      lastName: createInput.lastName.trim(),
      email: createInput.email.trim().toLowerCase(),
      temporaryPassword: createInput.temporaryPassword,
    };
    if (!input.firstName) {
      setNotice({ type: "error", text: t("firstNameRequiredError") });
      return;
    }
    if (!input.lastName) {
      setNotice({ type: "error", text: t("lastNameRequiredError") });
      return;
    }
    if (!isValidEmail(input.email)) {
      setNotice({ type: "error", text: t("invalidInvitationEmailError") });
      return;
    }
    if (input.temporaryPassword.length < MIN_PASSWORD_LENGTH) {
      setNotice({ type: "error", text: t("passwordTooShort") });
      return;
    }
    setSavingKey("create");
    try {
      await createMobileTeamUser(input);
      setCreateInput(emptyCreateInput);
      setNotice({ type: "success", text: t("userCreated") });
      await load("refresh");
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("userCreateFailed") });
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
            .then(() => load("refresh"))
            .then(() => setNotice({ type: "success", text: t("userAccessRemoved") }))
            .catch((error) => setNotice({ type: "error", text: error instanceof Error ? error.message : t("userRemoveFailed") }))
            .finally(() => setSavingKey(null));
        },
      },
    ]);
  }

  async function handleTemporaryPasswordReset() {
    if (!resetTarget || resetPassword.length < MIN_PASSWORD_LENGTH) {
      setNotice({ type: "error", text: t("passwordTooShort") });
      return;
    }
    setSavingKey(resetTarget.id);
    try {
      await resetMobileTeamUserTemporaryPassword(resetTarget.id, resetPassword);
      setResetTarget(null);
      setResetPassword("");
      setNotice({ type: "success", text: t("temporaryPasswordReset") });
      await load("refresh");
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("temporaryPasswordResetFailed") });
    } finally {
      setSavingKey(null);
    }
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
            title={t("teamAddUser")}
            right={seatUsage ? <Badge label={accountSummary} tone="success" /> : undefined}
          />

          {notice ? <View style={[styles.notice, {
            backgroundColor: notice.type === "success" ? theme.successSoft : theme.dangerSoft,
            borderColor: notice.type === "success" ? theme.success : theme.danger,
          }]}>
            <Text style={[styles.noticeText, { color: notice.type === "success" ? theme.success : theme.danger }]}>{notice.text}</Text>
          </View> : null}

          {seatUsage ? <SurfaceCard style={styles.summaryCard}>
            <View>
              <Text style={[styles.smallLabel, { color: theme.muted }]}>{t("currentPlan")}</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{seatUsage.planName}</Text>
            </View>
            <View style={styles.summaryRight}>
              <Text style={[styles.smallLabel, { color: theme.muted }]}>{t("accountUsage")}</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{accountSummary}</Text>
            </View>
          </SurfaceCard> : null}

          {permissions.canCreateUsers ? <SurfaceCard style={styles.formCard}>
            <SectionTitle title={t("addNewUser")} />
            <Text style={[styles.helperText, { color: theme.muted }]}>{t("addNewUserDescription")}</Text>
            <TextField label={t("firstName")} value={createInput.firstName} onChangeText={(firstName) => setCreateInput((current) => ({ ...current, firstName }))} />
            <TextField label={t("lastName")} value={createInput.lastName} onChangeText={(lastName) => setCreateInput((current) => ({ ...current, lastName }))} />
            <TextField label={t("email")} autoCapitalize="none" keyboardType="email-address" value={createInput.email} onChangeText={(email) => setCreateInput((current) => ({ ...current, email }))} />
            <TextField label={t("temporaryPassword")} secureTextEntry value={createInput.temporaryPassword} onChangeText={(temporaryPassword) => setCreateInput((current) => ({ ...current, temporaryPassword }))} />
            <Text style={[styles.helperText, { color: theme.muted }]}>{t("passwordPolicy")}</Text>
            <PrimaryButton
              title={t("createUser")}
              icon="person-add-outline"
              loading={savingKey === "create"}
              disabled={Boolean(savingKey) || seatUsage?.available === 0}
              onPress={handleCreateUser}
            />
            {seatUsage?.available === 0 ? <Text style={[styles.helperText, { color: theme.muted }]}>{t("noAvailableAccounts")}</Text> : null}
          </SurfaceCard> : <SurfaceCard><Text style={[styles.helperText, { color: theme.muted }]}>{t("usersReadOnlySharedMembership")}</Text></SurfaceCard>}

          {resetTarget ? <SurfaceCard style={styles.formCard}>
            <SectionTitle title={t("resetTemporaryPassword")} />
            <Text style={[styles.helperText, { color: theme.muted }]}>{resetTarget.user.name} · {resetTarget.user.email}</Text>
            <TextField label={t("temporaryPassword")} secureTextEntry value={resetPassword} onChangeText={setResetPassword} />
            <PrimaryButton title={t("saveTemporaryPassword")} loading={savingKey === resetTarget.id} onPress={handleTemporaryPasswordReset} />
            <Pressable onPress={() => { setResetTarget(null); setResetPassword(""); }} style={styles.centerButton}>
              <Text style={{ color: theme.primary }}>{t("cancel")}</Text>
            </Pressable>
          </SurfaceCard> : null}

          <SectionTitle title={t("companyUsers")} />
          {loading ? <SurfaceCard style={styles.loadingCard}><ActivityIndicator color={theme.primary} /><Text style={[styles.helperText, { color: theme.muted }]}>{t("usersLoading")}</Text></SurfaceCard> : (
            <View style={styles.memberList}>
              {users.map((member) => {
                const pendingPasswordChange = member.user.mustChangePassword;
                const statusText = pendingPasswordChange
                  ? t("passwordChangePending")
                  : member.status === "ACTIVE" ? t("memberStatusActive") : t("memberStatusSuspended");
                return <SurfaceCard key={member.id} style={styles.memberCard}>
                  <View style={styles.memberHeader}>
                    <View style={[styles.avatar, { backgroundColor: theme.badge }]}>
                      <Text style={[styles.avatarText, { color: theme.primary }]}>{member.user.name.trim()[0]?.toLocaleUpperCase(localeMetadata[locale].intlLocale) ?? "L"}</Text>
                    </View>
                    <View style={styles.memberIdentity}>
                      <Text style={[styles.memberName, { color: theme.text }]} numberOfLines={1}>{member.user.name}{member.isCurrent ? ` · ${t("currentUser")}` : ""}</Text>
                      <Text style={[styles.memberEmail, { color: theme.muted }]} numberOfLines={1}>{member.user.email}</Text>
                      <Text style={[styles.memberEmail, { color: theme.muted }]}>{member.user.lastLoginAt ? t("lastLoginAt", { date: formatDateTime(member.user.lastLoginAt, locale) }) : t("noLastLogin")}</Text>
                    </View>
                    <Badge label={statusText} tone={member.status === "SUSPENDED" ? "danger" : pendingPasswordChange ? "warning" : "success"} />
                  </View>
                  <Text style={[styles.helperText, { color: theme.muted }]}>{member.role === "OWNER" ? t("roleOwner") : t("standardUser")}</Text>
                  {member.role !== "OWNER" && member.canManagePendingCredentials ? <View style={styles.actions}>
                    {permissions.canResetTemporaryPasswords ? <ActionButton icon="key-outline" label={t("resetTemporaryPassword")} onPress={() => { setResetTarget(member); setResetPassword(""); }} disabled={savingKey !== null} /> : null}
                    {permissions.canRemoveUsers ? <ActionButton icon="trash-outline" label={t("remove")} danger onPress={() => confirmRemove(member)} disabled={savingKey !== null} /> : null}
                  </View> : null}
                </SurfaceCard>;
              })}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ActionButton({ icon, label, danger = false, disabled, onPress }: {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const color = danger ? theme.danger : theme.primary;
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.actionButton, { borderColor: color, opacity: disabled ? 0.5 : 1 }]}>
    <Ionicons name={icon} size={17} color={color} />
    <Text style={[styles.actionText, { color }]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  keyboard: { flex: 1 },
  content: { gap: 16, paddingBottom: 44 },
  notice: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  noticeText: { fontSize: 14, fontWeight: "800", lineHeight: 20 },
  summaryCard: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  summaryRight: { alignItems: "flex-end" },
  summaryValue: { fontSize: 17, fontWeight: "900", marginTop: 4 },
  smallLabel: { fontSize: 12, fontWeight: "700" },
  formCard: { gap: 14 },
  helperText: { fontSize: 13, fontWeight: "700", lineHeight: 19 },
  centerButton: { alignItems: "center", minHeight: 44, justifyContent: "center" },
  loadingCard: { alignItems: "center", gap: 12, paddingVertical: 28 },
  memberList: { gap: 14 },
  memberCard: { gap: 14 },
  memberHeader: { alignItems: "center", flexDirection: "row", gap: 12 },
  avatar: { alignItems: "center", borderRadius: 20, height: 40, justifyContent: "center", width: 40 },
  avatarText: { fontSize: 17, fontWeight: "900" },
  memberIdentity: { flex: 1, gap: 3, minWidth: 0 },
  memberName: { fontSize: 17, fontWeight: "900" },
  memberEmail: { fontSize: 12, fontWeight: "700", lineHeight: 17 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionButton: { alignItems: "center", borderRadius: 8, borderWidth: 1, flexDirection: "row", gap: 7, minHeight: 44, paddingHorizontal: 12 },
  actionText: { fontSize: 12, fontWeight: "900" },
});
