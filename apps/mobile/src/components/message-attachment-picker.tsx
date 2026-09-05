import { useEffect, useRef, useState, type RefObject } from "react";
import { AccessibilityInfo, ActivityIndicator, findNodeHandle, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  MAX_MESSAGE_ATTACHMENTS,
  maxAttachmentBytes,
  pickMessageDocuments,
  pickMessagePhotos,
  pickMessageVideos,
  type LocalMessageAttachment,
  type MessageAttachmentPlatform,
} from "@/api/mobileMedia";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

function formatBytes(bytes: number) {
  if (!bytes) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function MessageAttachmentPicker({
  value,
  onChange,
  onError,
  platform,
  disabled = false,
  uploadState,
  onCancelUpload,
  onRetryUpload,
}: {
  value: LocalMessageAttachment[];
  onChange: (value: LocalMessageAttachment[]) => void;
  onError: (message: string | null) => void;
  platform: MessageAttachmentPlatform;
  disabled?: boolean;
  uploadState?: { active: boolean; completed: number; currentIndex: number; total: number; failed: boolean } | null;
  onCancelUpload?: () => void;
  onRetryUpload?: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [sheetVisible, setSheetVisible] = useState(false);
  const triggerRef = useRef<View>(null);
  const closeRef = useRef<View>(null);

  function focus(ref: RefObject<View | null>) {
    const node = findNodeHandle(ref.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }

  function closeSheet(restoreFocus = true) {
    setSheetVisible(false);
    if (restoreFocus) setTimeout(() => focus(triggerRef), 120);
  }

  useEffect(() => {
    if (sheetVisible) setTimeout(() => focus(closeRef), 180);
  }, [sheetVisible]);

  async function select(kind: "PHOTO" | "VIDEO" | "DOCUMENT") {
    try {
      onError(null);
      const selected = kind === "PHOTO" ? await pickMessagePhotos() : kind === "VIDEO" ? await pickMessageVideos() : await pickMessageDocuments();
      if (!selected.length) return;
      const maximumBytes = maxAttachmentBytes(platform);
      if (selected.some((file) => file.size > maximumBytes)) {
        throw new Error(platform === "WHATSAPP" ? t("whatsAppAttachmentTooLarge") : t("telegramAttachmentTooLarge"));
      }
      const merged = [...value];
      for (const file of selected) {
        if (!merged.some((current) => current.uri === file.uri && current.fileName === file.fileName && current.size === file.size)) {
          merged.push(file);
        }
      }
      if (merged.length > MAX_MESSAGE_ATTACHMENTS) throw new Error(t("attachmentCountTooLarge", { max: MAX_MESSAGE_ATTACHMENTS }));
      onChange(merged);
      closeSheet();
    } catch (error) {
      onError(error instanceof Error ? error.message : t("attachmentPickFailed"));
    }
  }

  return (
    <View style={styles.container}>
      <Pressable
        ref={triggerRef}
        accessibilityRole="button"
        accessibilityLabel={t("addAttachment")}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setSheetVisible(true)}
        style={({ pressed }) => [
          styles.plusButton,
          { borderColor: theme.border, backgroundColor: theme.background, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
        ]}
      >
        <Ionicons name="add" size={24} color={theme.primary} />
        <Text style={[styles.plusLabel, { color: theme.text }]}>{t("addAttachment")}</Text>
      </Pressable>
      {value.length ? (
        <View style={styles.selectedList}>
          <View style={styles.selectedHeader}>
            <Text style={[styles.selectedCount, { color: theme.text }]}>{t("selectedAttachmentCount", { count: value.length })}</Text>
            <Pressable accessibilityRole="button" disabled={disabled} onPress={() => onChange([])}>
              <Text style={[styles.removeAll, { color: theme.danger }]}>{t("removeAllAttachments")}</Text>
            </Pressable>
          </View>
          {value.map((file, index) => (
            <View key={`${file.uri}:${index}`} style={[styles.selected, { borderColor: theme.primary, backgroundColor: theme.badge }]}>
              <Ionicons name={file.kind === "PHOTO" ? "image-outline" : file.kind === "VIDEO" ? "videocam-outline" : "document-text-outline"} size={22} color={theme.primary} />
              <View style={styles.selectedCopy}>
                <Text numberOfLines={1} style={[styles.fileName, { color: theme.text }]}>{file.fileName}</Text>
                <Text style={[styles.fileMeta, { color: theme.muted }]}>{formatBytes(file.size) || file.mimeType}</Text>
                {uploadState?.active && uploadState.currentIndex === index ? (
                  <View style={styles.uploadRow}>
                    <ActivityIndicator color={theme.primary} size="small" />
                    <Text accessibilityLiveRegion="polite" style={[styles.fileMeta, { color: theme.primary }]}>
                      {t("attachmentUploading", { completed: uploadState.completed, total: uploadState.total })}
                    </Text>
                  </View>
                ) : null}
                {uploadState?.failed && uploadState.currentIndex === index ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={t("retryAttachmentUpload")} onPress={onRetryUpload}>
                    <Text style={[styles.retryText, { color: theme.danger }]}>{t("retryAttachmentUpload")}</Text>
                  </Pressable>
                ) : null}
              </View>
              {uploadState?.active && uploadState.currentIndex === index ? (
                <Pressable accessibilityRole="button" accessibilityLabel={t("cancelAttachmentUpload")} onPress={onCancelUpload} hitSlop={10}>
                  <Ionicons name="stop-circle-outline" size={27} color={theme.danger} />
                </Pressable>
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel={t("removeAttachment")} disabled={disabled} onPress={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))} hitSlop={10}>
                  <Ionicons name="close-circle" size={25} color={theme.danger} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.help, { color: theme.muted }]}>{platform === "WHATSAPP" ? t("whatsAppAttachmentHelp") : t("telegramAttachmentHelp")}</Text>
      )}
      <Modal animationType="slide" statusBarTranslucent transparent visible={sheetVisible} onRequestClose={() => closeSheet()}>
        <View style={styles.modalRoot}>
          <Pressable accessible={false} importantForAccessibility="no" style={styles.backdrop} onPress={() => closeSheet()} />
          <View
            accessibilityViewIsModal
            onAccessibilityEscape={() => closeSheet()}
            style={[
              styles.sheet,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                maxHeight: Math.max(240, windowHeight - Math.max(insets.top, 24)),
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: theme.border }]} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>{t("addAttachment")}</Text>
              <Pressable ref={closeRef} accessibilityRole="button" accessibilityLabel={t("close")} onPress={() => closeSheet()} style={styles.closeButton}>
                <Ionicons name="close" size={25} color={theme.muted} />
              </Pressable>
            </View>
            <ScrollView bounces={false} contentContainerStyle={styles.sheetActions} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <AttachmentAction disabled={disabled} icon="image-outline" label={t("photo")} onPress={() => void select("PHOTO")} />
              <AttachmentAction disabled={disabled} icon="videocam-outline" label={t("video")} onPress={() => void select("VIDEO")} />
              <AttachmentAction disabled={disabled} icon="document-text-outline" label={t("document")} onPress={() => void select("DOCUMENT")} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function AttachmentAction({ disabled, icon, label, onPress }: { disabled: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, { borderColor: theme.border, backgroundColor: theme.background, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }]}>
      <Ionicons name={icon} size={21} color={theme.primary} />
      <Text style={[styles.actionLabel, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  plusButton: { alignItems: "center", alignSelf: "flex-start", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 8, minHeight: 48, paddingHorizontal: 14 },
  plusLabel: { fontSize: 14, fontWeight: "800" },
  action: { alignItems: "center", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 52, paddingHorizontal: 14, paddingVertical: 10 },
  actionLabel: { fontSize: 14, fontWeight: "800" },
  selected: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 10, padding: 12 },
  selectedList: { gap: 8 },
  selectedHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  selectedCount: { fontSize: 13, fontWeight: "800" },
  removeAll: { fontSize: 13, fontWeight: "800" },
  selectedCopy: { flex: 1, minWidth: 0 },
  fileName: { fontSize: 14, fontWeight: "800" },
  fileMeta: { fontSize: 12, marginTop: 2 },
  retryText: { fontSize: 12, fontWeight: "800", marginTop: 5 },
  uploadRow: { alignItems: "center", flexDirection: "row", gap: 7, marginTop: 5 },
  help: { fontSize: 12, lineHeight: 18 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.48)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, gap: 14, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: "center", borderRadius: 2, height: 4, width: 44 },
  sheetHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  sheetTitle: { fontSize: 18, fontWeight: "900" },
  sheetActions: { gap: 10 },
  closeButton: { alignItems: "center", justifyContent: "center", minHeight: 48, minWidth: 48 },
});
