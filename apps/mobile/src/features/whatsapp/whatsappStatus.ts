import type { TranslationKey } from "@/i18n/translations";

export type WhatsAppStatusTone = "success" | "warning" | "danger" | "muted";

export type WhatsAppStatusMeta = {
  labelKey: TranslationKey;
  tone: WhatsAppStatusTone;
  iconName: string;
};

export function mapWhatsAppStatus(status?: string | null): WhatsAppStatusMeta {
  switch (status) {
    case "CONNECTED":
      return { labelKey: "statusConnected", tone: "success", iconName: "check-circle" };
    case "PENDING_QR":
      return { labelKey: "statusWaitingQr", tone: "warning", iconName: "qr-code" };
    case "PENDING_PHONE_CODE":
    case "CONNECTING":
      return { labelKey: "statusConnecting", tone: "warning", iconName: "loader" };
    case "FAILED":
      return { labelKey: "statusFailed", tone: "danger", iconName: "alert-circle" };
    case "ARCHIVED":
      return { labelKey: "statusArchived", tone: "muted", iconName: "archive" };
    case "DISCONNECTED":
    default:
      return { labelKey: "statusNotConnected", tone: "muted", iconName: "wifi-off" };
  }
}
