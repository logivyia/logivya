import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { useSettingsStore } from "@/auth/settings-store";
import { formatNumber } from "@/i18n/format";
import { colors } from "@/theme/colors";
import { useTheme } from "@/theme/theme-provider";

type IconName = ComponentProps<typeof Ionicons>["name"];
type Tone = "default" | "primary" | "success" | "warning" | "danger";

export function PageHeader({
  eyebrow,
  title,
  description,
  right
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 380;

  return (
    <View style={[styles.header, compact ? styles.headerCompact : null]}>
      <View style={styles.headerText}>
        {eyebrow ? <Text style={[styles.eyebrow, { color: theme.primary }]}>{eyebrow}</Text> : null}
        <Text style={[styles.title, compact ? styles.titleCompact : null, { color: theme.text }]}>{title}</Text>
        {description ? <Text style={[styles.description, { color: theme.muted }]}>{description}</Text> : null}
      </View>
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

export function SurfaceCard({ children, style }: { children: ReactNode; style?: object }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          shadowColor: theme.shadow
        },
        style
      ]}
    >
      {children}
    </View>
  );
}

export function Badge({ label, tone = "default" }: { label: string; tone?: Tone }) {
  const theme = useTheme();
  const palette = getTone(tone, theme);
  return (
    <View style={[styles.badge, { backgroundColor: palette.background }]}>
      <Text style={[styles.badgeText, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function IconBadge({ icon, tone = "primary" }: { icon: IconName; tone?: Tone }) {
  const theme = useTheme();
  const palette = getTone(tone, theme);
  return (
    <View style={[styles.iconBadge, { backgroundColor: palette.background }]}>
      <Ionicons name={icon} size={20} color={palette.text} />
    </View>
  );
}

export function StatCard({ label, value, icon, tone = "primary" }: { label: string; value: string | number; icon: IconName; tone?: Tone }) {
  const theme = useTheme();
  const locale = useSettingsStore((state) => state.locale);
  return (
    <SurfaceCard style={styles.statCard}>
      <IconBadge icon={icon} tone={tone} />
      <Text style={[styles.statValue, { color: theme.text }]} numberOfLines={1}>
        {typeof value === "number" ? formatNumber(value, locale) : value}
      </Text>
      <Text style={[styles.statLabel, { color: theme.muted }]} numberOfLines={2}>
        {label}
      </Text>
    </SurfaceCard>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={[styles.sectionTitle, { color: theme.text }]} numberOfLines={2}>
        {title}
      </Text>
      {action}
    </View>
  );
}

export function ActionRow({
  icon,
  title,
  description,
  badge,
  onPress,
  tone = "primary"
}: {
  icon: IconName;
  title: string;
  description?: string;
  badge?: string;
  onPress: () => void;
  tone?: Tone;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, { backgroundColor: theme.card, borderColor: theme.border }, pressed ? styles.pressed : null]}
    >
      <IconBadge icon={icon} tone={tone} />
      <View style={styles.actionText}>
        <Text style={[styles.actionTitle, { color: theme.text }]} numberOfLines={2}>
          {title}
        </Text>
        {description ? (
          <Text style={[styles.actionDescription, { color: theme.muted }]} numberOfLines={3}>
            {description}
          </Text>
        ) : null}
      </View>
      {badge ? <Badge label={badge} tone={tone} /> : <Ionicons name="chevron-forward" size={20} color={theme.iconMuted} />}
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? theme.primary : theme.cardMuted, borderColor: active ? theme.primary : theme.border }]}
    >
      <Text style={[styles.chipText, { color: active ? theme.primaryText : theme.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function getTone(tone: Tone, theme: ReturnType<typeof useTheme>) {
  if (tone === "success") return { background: theme.successSoft, text: colors.success };
  if (tone === "warning") return { background: theme.warningSoft, text: colors.warning };
  if (tone === "danger") return { background: theme.dangerSoft, text: colors.danger };
  if (tone === "primary") return { background: theme.badge, text: theme.primary };
  return { background: theme.cardMuted, text: theme.muted };
}

const styles = StyleSheet.create({
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  headerCompact: {
    flexDirection: "column"
  },
  headerText: {
    flex: 1,
    gap: 8,
    minWidth: 0
  },
  headerRight: {
    alignSelf: "flex-start"
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    textTransform: "uppercase"
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 34
  },
  titleCompact: {
    fontSize: 24,
    lineHeight: 30
  },
  description: {
    fontSize: 15,
    lineHeight: 22
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    elevation: 2,
    padding: 18,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 22
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "900"
  },
  iconBadge: {
    alignItems: "center",
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  statCard: {
    gap: 10,
    minWidth: 0,
    width: "100%"
  },
  statValue: {
    fontSize: 26,
    fontWeight: "900"
  },
  statLabel: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  sectionTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  sectionTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "900"
  },
  actionRow: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 74,
    padding: 14
  },
  actionText: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20
  },
  actionDescription: {
    fontSize: 13,
    lineHeight: 18
  },
  pressed: {
    opacity: 0.78
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  chipText: {
    fontSize: 13,
    fontWeight: "900"
  }
});
