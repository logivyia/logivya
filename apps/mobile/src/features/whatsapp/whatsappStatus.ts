import type { TranslationKey } from "@/i18n/translations";
import { translateCurrent } from "@/i18n/runtime";

export type WhatsAppStatusTone = "success" | "warning" | "danger" | "muted";

export type WhatsAppStatusMeta = {
  labelKey: TranslationKey;
  tone: WhatsAppStatusTone;
  iconName: string;
};

type WhatsAppStatusInput = {
  status?: string | null | undefined;
  lastError?: string | null | undefined;
};

const connectingStatuses = new Set(["CONNECTING", "RECONNECTING", "DEGRADED"]);
const pendingStatuses = new Set(["PENDING_QR", "PENDING_PHONE", "PENDING_PHONE_CODE", "PENDING_PAIRING", "PAIRING_CODE_READY"]);
const reconnectRequiredStatuses = new Set(["AUTH_REQUIRED", "LOGGED_OUT", "RECONNECT_REQUIRED"]);
const disconnectedStatuses = new Set(["FAILED", "DISCONNECTED", "ERROR"]);
const loggedOutErrors = new Set(["LOGGED_OUT", "WHATSAPP_LOGGED_OUT"]);
const authRequiredErrors = new Set(["AUTH_REQUIRED", "WHATSAPP_CREDENTIALS_MISSING"]);
const reconnectingErrors = new Set(["WHATSAPP_RECONNECT_REQUIRED", "WHATSAPP_TRANSIENT_DISCONNECT"]);

function normalizeSignal(value?: string | null) {
  return value?.trim().toUpperCase() || "";
}

export function mapWhatsAppStatus(status?: string | null, lastError?: string | null): WhatsAppStatusMeta {
  if (lastError) return getWhatsAppHealthStatus({ status, lastError });

  switch (normalizeSignal(status)) {
    case "CONNECTED":
      return { labelKey: "statusConnected", tone: "success", iconName: "check-circle" };
    case "PENDING_QR":
      return { labelKey: "statusConnecting", tone: "warning", iconName: "qr-code" };
    case "PENDING_PHONE":
    case "PENDING_PHONE_CODE":
    case "PENDING_PAIRING":
    case "PAIRING_CODE_READY":
      return { labelKey: "statusConnecting", tone: "warning", iconName: "phone" };
    case "CONNECTING":
    case "RECONNECTING":
    case "DEGRADED":
      return { labelKey: "statusConnecting", tone: "warning", iconName: "loader" };
    case "AUTH_REQUIRED":
    case "LOGGED_OUT":
    case "RECONNECT_REQUIRED":
      return { labelKey: "statusReconnectRequired", tone: "danger", iconName: "wifi-off" };
    case "FAILED":
    case "ERROR":
      return { labelKey: "statusDisconnected", tone: "danger", iconName: "alert-circle" };
    case "ARCHIVED":
      return { labelKey: "statusArchived", tone: "muted", iconName: "archive" };
    case "DISCONNECTED":
    default:
      return { labelKey: "statusDisconnected", tone: "muted", iconName: "wifi-off" };
  }
}

export function getWhatsAppHealthStatus(input: WhatsAppStatusInput): WhatsAppStatusMeta {
  const status = normalizeSignal(input.status);
  const lastError = normalizeSignal(input.lastError);

  if (status === "CONNECTED" && !lastError) {
    return { labelKey: "statusConnected", tone: "success", iconName: "check-circle" };
  }

  if (reconnectingErrors.has(lastError) || (lastError === "WHATSAPP_CREDENTIALS_MISSING" && ["CONNECTED", "CONNECTING", "DISCONNECTED", "RECONNECT_REQUIRED"].includes(status))) {
    return { labelKey: "statusConnecting", tone: "warning", iconName: "loader" };
  }

  if (reconnectRequiredStatuses.has(status) || loggedOutErrors.has(lastError) || authRequiredErrors.has(lastError)) {
    return { labelKey: "statusReconnectRequired", tone: "danger", iconName: "wifi-off" };
  }

  if (disconnectedStatuses.has(status) || lastError) {
    return { labelKey: "statusDisconnected", tone: "danger", iconName: "alert-circle" };
  }

  if (connectingStatuses.has(status) || pendingStatuses.has(status)) {
    return { labelKey: "statusConnecting", tone: "warning", iconName: "loader" };
  }

  return { labelKey: "statusDisconnected", tone: "muted", iconName: "wifi-off" };
}

export function getWhatsAppUserMessageKey(input?: WhatsAppStatusInput | null): TranslationKey | null {
  if (!input) return null;

  const status = normalizeSignal(input.status);
  const lastError = normalizeSignal(input.lastError);

  if (status === "CONNECTED" && !lastError) return null;
  if (loggedOutErrors.has(lastError) || status === "LOGGED_OUT") return "whatsappMessageLoggedOut";
  if (lastError === "WHATSAPP_CREDENTIALS_MISSING" && ["CONNECTED", "CONNECTING", "DISCONNECTED", "RECONNECT_REQUIRED"].includes(status)) return "whatsappMessageReconnecting";
  if (authRequiredErrors.has(lastError) || status === "AUTH_REQUIRED" || status === "RECONNECT_REQUIRED") return "whatsappMessageAuthRequired";
  if (reconnectingErrors.has(lastError)) return "whatsappMessageReconnecting";
  if (lastError || status === "FAILED" || status === "ERROR") return "whatsappMessageConnectionFailed";
  if (connectingStatuses.has(status)) return "whatsappMessageReconnecting";
  if (pendingStatuses.has(status)) return "whatsappMessageChecking";
  if (status === "DISCONNECTED") return "whatsappMessageReconnect";

  return null;
}

export function getWhatsAppUserMessage(input?: WhatsAppStatusInput | null) {
  const key = getWhatsAppUserMessageKey(input);
  return key ? translateCurrent(key) : null;
}
