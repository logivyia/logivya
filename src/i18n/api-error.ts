type Translator = (key: string, variables?: Record<string, string | number>) => string;

type ApiErrorPayload = {
  error?: unknown;
  code?: unknown;
  message?: unknown;
};

const errorKeyByCode: Record<string, string> = {
  UNAUTHORIZED: "api.error.sessionExpired",
  FORBIDDEN: "api.error.forbidden",
  NOT_FOUND: "api.error.notFound",
  VALIDATION_ERROR: "api.error.validation",
  RATE_LIMITED: "api.error.rateLimited",
  ADMIN_RATE_LIMITED: "api.error.rateLimited",
  SUBSCRIPTION_LOCKED: "api.error.subscriptionLocked",
  CONTACT_MESSAGING_REQUIRES_PROFESSIONAL: "api.error.contactMessagingProfessional",
  SEAT_LIMIT_REACHED: "api.error.seatLimitReached",
  WHATSAPP_ACCOUNT_REQUIRED: "api.error.whatsappAccountRequired",
  WHATSAPP_ACCOUNT_NOT_OWNED: "api.error.whatsappAccountRequired",
  CATEGORY_NOT_FOUND: "api.error.categoryNotFound",
  CONTACT_NOT_OWNED: "api.error.contactNotOwned",
  ADMIN_REQUEST_FAILED: "api.error.adminRequestFailed",
  CSRF_REJECTED: "api.error.forbidden",
  SUPPORT_ADMIN_REQUIRED: "api.error.forbidden",
  SUPPORT_TICKET_NOT_FOUND: "api.error.supportTicketNotFound",
  SUPPORT_INVALID_CATEGORY: "api.error.validation",
  SUPPORT_INVALID_CLIENT_MESSAGE_ID: "api.error.validation",
  SUPPORT_INVALID_ATTACHMENT: "api.error.validation",
  SUPPORT_VALIDATION_ERROR: "api.error.validation",
  SUPPORT_TICKET_CLOSED: "support.closedNoReply",
  SUPPORT_INVALID_STATUS_TRANSITION: "support.invalidTransition",
  SUPPORT_INVALID_STATUS: "api.error.validation",
  SUPPORT_INVALID_PRIORITY: "api.error.validation",
  SUPPORT_INVALID_ASSIGNEE: "api.error.validation",
  SUPPORT_RATE_LIMITED: "api.error.rateLimited",
  SUPPORT_DEPENDENCY_UNAVAILABLE: "api.error.generic",
  PASSWORD_REQUIRED: "auth.passwordRequired",
  PASSWORD_TOO_SHORT: "auth.passwordTooShort",
  PASSWORD_CONFIRMATION_MISMATCH: "auth.passwordConfirmationMismatch",
  PASSWORD_INVALID_TYPE: "auth.passwordInvalidType",
  REGISTRATION_FAILED: "api.error.registrationFailed",
  EMAIL_ALREADY_REGISTERED: "api.error.accountExists",
  ACCOUNT_EXISTS: "api.error.accountExists",
};

function translationKey(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  if (normalized.includes(".") && !normalized.includes(" ")) return normalized;
  return errorKeyByCode[normalized.toUpperCase()] ?? null;
}

export function apiErrorMessage(t: Translator, payload: ApiErrorPayload | null | undefined, fallbackKey = "errors.generic") {
  const key = translationKey(payload?.error) ?? translationKey(payload?.code) ?? translationKey(payload?.message);
  return t(key ?? fallbackKey);
}
