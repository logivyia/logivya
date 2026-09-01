type Translator = (key: string, variables?: Record<string, string | number>) => string;

type ApiErrorPayload = {
  error?: unknown | { code?: unknown; message?: unknown };
  code?: unknown;
  message?: unknown;
};

const errorKeyByCode: Record<string, string> = {
  AUTH_INVALID_CREDENTIALS: "api.error.invalidCredentials",
  UNAUTHORIZED: "api.error.sessionExpired",
  FORBIDDEN: "api.error.forbidden",
  NOT_FOUND: "api.error.notFound",
  VALIDATION_ERROR: "api.error.validation",
  RATE_LIMITED: "api.error.rateLimited",
  ADMIN_RATE_LIMITED: "api.error.rateLimited",
  SUBSCRIPTION_LOCKED: "api.error.subscriptionLocked",
  CONTACT_MESSAGING_REQUIRES_PROFESSIONAL: "api.error.contactMessagingProfessional",
  SEAT_LIMIT_REACHED: "api.error.seatLimitReached",
  USER_ALREADY_IN_TENANT: "api.error.userAlreadyInTenant",
  EMAIL_NOT_AVAILABLE: "api.error.emailNotAvailable",
  FIRST_NAME_REQUIRED: "api.error.firstNameRequired",
  LAST_NAME_REQUIRED: "api.error.lastNameRequired",
  INVALID_TEMPORARY_PASSWORD: "auth.temporaryPasswordInvalid",
  PASSWORD_REUSE_NOT_ALLOWED: "auth.passwordReuseNotAllowed",
  PASSWORD_CHANGE_CHALLENGE_EXPIRED: "auth.passwordChangeExpired",
  PASSWORD_CHANGE_CHALLENGE_INVALID: "auth.passwordChangeInvalid",
  PASSWORD_CHANGE_FAILED: "auth.passwordChangeFailed",
  INVITATION_FLOW_DISABLED: "api.error.invitationFlowDisabled",
  ALREADY_MEMBER: "api.error.alreadyMember",
  INVITATION_ALREADY_PENDING: "api.error.invitationAlreadyPending",
  SELF_INVITATION: "api.error.selfInvitation",
  INVALID_EMAIL: "api.error.invalidEmail",
  INVITATION_NAME_REQUIRED: "api.error.invitationNameRequired",
  INVITATION_PERMISSION_DENIED: "api.error.invitationPermissionDenied",
  INVITATION_DELIVERY_CONFIGURATION_ERROR: "api.error.invitationDeliveryConfiguration",
  INVITATION_REQUEST_FAILED: "api.error.invitationRequestFailed",
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
  PASSWORD_CONFIRMATION_REQUIRED: "auth.passwordRequired",
  INVALID_TOTP_CODE: "api.error.authMfaCodeInvalid",
  MFA_CODE_INVALID: "api.error.authMfaCodeInvalid",
  MFA_INVALID: "api.error.authMfaCodeInvalid",
  MFA_CODE_REUSED: "api.error.authMfaCodeReused",
  MFA_EMAIL_OTP_INVALID: "api.error.authMfaCodeInvalid",
  MFA_EMAIL_OTP_EXPIRED: "api.error.authMfaChallengeExpired",
  MFA_METHOD_NOT_ENABLED: "security.disabled",
  MFA_METHOD_REQUIRED_BY_POLICY: "security.policyActionRequired",
  RECENT_AUTHENTICATION_REQUIRED: "api.error.validation",
  MFA_DEVICE_MISMATCH: "api.error.sessionExpired",
  AUTH_MFA_CODE_INVALID: "api.error.authMfaCodeInvalid",
  AUTH_MFA_CODE_REUSED: "api.error.authMfaCodeReused",
  AUTH_MFA_CHALLENGE_EXPIRED: "api.error.authMfaChallengeExpired",
  AUTH_MFA_RATE_LIMITED: "api.error.authMfaRateLimited",
  AUTH_SESSION_CREATE_FAILED: "api.error.authSessionCreateFailed",
  AUTH_METHOD_UNAVAILABLE: "api.error.authMethodUnavailable",
  AUTH_INTERNAL_ERROR: "api.error.authInternal",
  SOCIAL_ACCOUNT_NOT_FOUND: "api.error.socialAccountNotFound",
  SOCIAL_PASSWORD_REQUIRED: "api.error.socialPasswordRequired",
  SOCIAL_LOGIN_NOT_CONFIGURED: "api.error.socialLoginNotConfigured",
  SOCIAL_TOKEN_INVALID: "api.error.socialTokenInvalid",
  SOCIAL_EMAIL_UNVERIFIED: "api.error.socialTokenInvalid",
  MFA_CHALLENGE_INVALID: "api.error.sessionExpired",
  MFA_CHALLENGE_EXPIRED: "api.error.sessionExpired",
  MFA_CHALLENGE_LOCKED: "api.error.rateLimited",
  TOO_MANY_TOTP_ATTEMPTS: "api.error.rateLimited",
  TWO_FACTOR_SETUP_NOT_FOUND: "api.error.sessionExpired",
  TWO_FACTOR_SETUP_EXPIRED: "api.error.sessionExpired",
  TWO_FACTOR_SETUP_IN_PROGRESS: "api.error.validation",
  REGISTRATION_FAILED: "api.error.registrationFailed",
  EMAIL_ALREADY_REGISTERED: "api.error.accountExists",
  ACCOUNT_EXISTS: "api.error.accountExists",
  MESSAGE_ATTRIBUTION_LENGTH_EXCEEDED: "api.error.messageAttributionTooLong",
  INVALID_WHATSAPP_PHONE: "accounts.phoneInvalid",
  PHONE_COUNTRY_MISMATCH: "accounts.phoneInvalid",
  UNSUPPORTED_PHONE_COUNTRY: "accounts.countryUnsupported",
  DUPLICATE_PHONE_COUNTRY_CODE: "accounts.countryCodeDuplicate",
  MEMBER_SELF_MANAGED_AFTER_ACTIVATION: "membership.usersReadOnly",
  PENDING_MEMBER_MANAGEMENT_ONLY: "membership.usersReadOnly",
  MEMBER_ALREADY_ACTIVATED: "membership.usersReadOnly",
  USER_MANAGEMENT_FORBIDDEN: "api.error.forbidden",
  ACTIVE_SHARED_MEMBERSHIP_EXISTS: "membership.sharedSubscriptionReadOnly",
  INDEPENDENT_CONVERSION_NOT_ALLOWED: "api.error.forbidden",
  SHARED_SUBSCRIPTION_READ_ONLY: "membership.sharedSubscriptionReadOnly",
  TENANT_DELETE_FORBIDDEN: "membership.sharedDeleteScope",
};

function translationKey(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  if (normalized.includes(".") && !normalized.includes(" ")) return normalized;
  return errorKeyByCode[normalized.toUpperCase()] ?? null;
}

export function apiErrorMessage(t: Translator, payload: ApiErrorPayload | null | undefined, fallbackKey = "errors.generic") {
  const nestedError = payload?.error && typeof payload.error === "object"
    ? payload.error as { code?: unknown; message?: unknown }
    : null;
  const key = translationKey(nestedError?.code)
    ?? translationKey(nestedError?.message)
    ?? translationKey(payload?.error)
    ?? translationKey(payload?.code)
    ?? translationKey(payload?.message);
  return t(key ?? fallbackKey);
}
