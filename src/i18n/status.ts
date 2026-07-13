type Translator = (key: string, variables?: Record<string, string | number>) => string;

type StatusScope = "whatsapp" | "subscription" | "payment" | "invoice" | "message";

const aliases: Record<StatusScope, Record<string, string>> = {
  whatsapp: {
    ACTIVE: "CONNECTED",
    NEW: "DISCONNECTED",
  },
  subscription: {
    TRIALING: "TRIAL",
    CANCELED: "CANCELLED",
  },
  payment: {},
  invoice: {
    CANCELED: "CANCELLED",
  },
  message: {
    CANCELED: "CANCELLED",
  },
};

const knownStatuses: Record<StatusScope, ReadonlySet<string>> = {
  whatsapp: new Set([
    "CONNECTED", "DISCONNECTED", "FAILED", "ERROR", "PENDING_QR", "QR_READY",
    "PENDING_PHONE", "PENDING_PAIRING", "PAIRING_CODE_READY", "CONNECTING",
    "RECONNECTING", "RECONNECT_REQUIRED", "ARCHIVED",
  ]),
  subscription: new Set(["TRIAL", "ACTIVE", "EXPIRED", "SUSPENDED", "CANCELLED", "MANUAL_PENDING", "PAST_DUE"]),
  payment: new Set(["PENDING", "MANUALLY_CONFIRMED", "PAID", "SUCCEEDED", "FAILED", "REJECTED", "REFUNDED", "CANCELED"]),
  invoice: new Set(["DRAFT", "ISSUED", "PAID", "CANCELLED", "FAILED"]),
  message: new Set(["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "PENDING", "QUEUED", "SCHEDULED", "SENDING", "CANCELLED", "DELETED", "DRAFT"]),
};

export function statusLabel(t: Translator, scope: StatusScope, value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "";
  const status = aliases[scope][normalized] ?? normalized;
  if (!knownStatuses[scope].has(status)) return t("status.unknown");
  return t(`status.${scope}.${status.toLowerCase()}`);
}

export function adminMenuLabel(t: Translator, key: string) {
  return t(`admin.menu.${key}`);
}
