import { randomUUID } from "node:crypto";

export type PublicAuthErrorCode =
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_MFA_CHALLENGE_EXPIRED"
  | "AUTH_MFA_CODE_INVALID"
  | "AUTH_MFA_CODE_REUSED"
  | "AUTH_MFA_RATE_LIMITED"
  | "AUTH_SESSION_CREATE_FAILED"
  | "AUTH_SESSION_EXPIRED"
  | "AUTH_REFRESH_FAILED"
  | "AUTH_ACCOUNT_DISABLED"
  | "AUTH_METHOD_UNAVAILABLE"
  | "AUTH_INTERNAL_ERROR";

export type PublicAuthFailure = {
  code: PublicAuthErrorCode;
  messageKey: string;
  status: number;
};

const failures: Record<PublicAuthErrorCode, PublicAuthFailure> = {
  AUTH_INVALID_CREDENTIALS: {
    code: "AUTH_INVALID_CREDENTIALS",
    messageKey: "api.error.invalidCredentials",
    status: 401,
  },
  AUTH_MFA_CHALLENGE_EXPIRED: {
    code: "AUTH_MFA_CHALLENGE_EXPIRED",
    messageKey: "api.error.authMfaChallengeExpired",
    status: 401,
  },
  AUTH_MFA_CODE_INVALID: {
    code: "AUTH_MFA_CODE_INVALID",
    messageKey: "api.error.authMfaCodeInvalid",
    status: 401,
  },
  AUTH_MFA_CODE_REUSED: {
    code: "AUTH_MFA_CODE_REUSED",
    messageKey: "api.error.authMfaCodeReused",
    status: 409,
  },
  AUTH_MFA_RATE_LIMITED: {
    code: "AUTH_MFA_RATE_LIMITED",
    messageKey: "api.error.authMfaRateLimited",
    status: 429,
  },
  AUTH_SESSION_CREATE_FAILED: {
    code: "AUTH_SESSION_CREATE_FAILED",
    messageKey: "api.error.authSessionCreateFailed",
    status: 503,
  },
  AUTH_SESSION_EXPIRED: {
    code: "AUTH_SESSION_EXPIRED",
    messageKey: "api.error.sessionExpired",
    status: 401,
  },
  AUTH_REFRESH_FAILED: {
    code: "AUTH_REFRESH_FAILED",
    messageKey: "api.error.sessionExpired",
    status: 401,
  },
  AUTH_ACCOUNT_DISABLED: {
    code: "AUTH_ACCOUNT_DISABLED",
    messageKey: "api.error.forbidden",
    status: 403,
  },
  AUTH_METHOD_UNAVAILABLE: {
    code: "AUTH_METHOD_UNAVAILABLE",
    messageKey: "api.error.authMethodUnavailable",
    status: 503,
  },
  AUTH_INTERNAL_ERROR: {
    code: "AUTH_INTERNAL_ERROR",
    messageKey: "api.error.authInternal",
    status: 500,
  },
};

const internalCodeMap: Record<string, PublicAuthErrorCode> = {
  INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  AUTH_INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  INVALID_TOTP_CODE: "AUTH_MFA_CODE_INVALID",
  MFA_CODE_INVALID: "AUTH_MFA_CODE_INVALID",
  MFA_EMAIL_OTP_INVALID: "AUTH_MFA_CODE_INVALID",
  MFA_INVALID: "AUTH_MFA_CODE_INVALID",
  AUTH_MFA_CODE_INVALID: "AUTH_MFA_CODE_INVALID",
  MFA_CODE_REUSED: "AUTH_MFA_CODE_REUSED",
  AUTH_MFA_CODE_REUSED: "AUTH_MFA_CODE_REUSED",
  MFA_CHALLENGE_INVALID: "AUTH_MFA_CHALLENGE_EXPIRED",
  MFA_CHALLENGE_EXPIRED: "AUTH_MFA_CHALLENGE_EXPIRED",
  TWO_FACTOR_SETUP_EXPIRED: "AUTH_MFA_CHALLENGE_EXPIRED",
  TWO_FACTOR_SETUP_NOT_FOUND: "AUTH_MFA_CHALLENGE_EXPIRED",
  AUTH_MFA_CHALLENGE_EXPIRED: "AUTH_MFA_CHALLENGE_EXPIRED",
  MFA_CHALLENGE_LOCKED: "AUTH_MFA_RATE_LIMITED",
  RATE_LIMITED: "AUTH_MFA_RATE_LIMITED",
  TOO_MANY_TOTP_ATTEMPTS: "AUTH_MFA_RATE_LIMITED",
  AUTH_MFA_RATE_LIMITED: "AUTH_MFA_RATE_LIMITED",
  MFA_EMAIL_OTP_EXPIRED: "AUTH_MFA_CHALLENGE_EXPIRED",
  MFA_EMAIL_DELIVERY_FAILED: "AUTH_METHOD_UNAVAILABLE",
  MFA_ENCRYPTION_NOT_CONFIGURED: "AUTH_METHOD_UNAVAILABLE",
  MFA_ENROLLMENT_NOT_FOUND: "AUTH_METHOD_UNAVAILABLE",
  MFA_METHOD_NOT_SELECTED: "AUTH_METHOD_UNAVAILABLE",
  MFA_METHOD_NOT_ENABLED: "AUTH_METHOD_UNAVAILABLE",
  MFA_NOT_ENROLLED: "AUTH_METHOD_UNAVAILABLE",
  AUTH_METHOD_UNAVAILABLE: "AUTH_METHOD_UNAVAILABLE",
  AUTH_SESSION_CREATE_FAILED: "AUTH_SESSION_CREATE_FAILED",
  AUTH_SESSION_EXPIRED: "AUTH_SESSION_EXPIRED",
  AUTH_REFRESH_FAILED: "AUTH_REFRESH_FAILED",
  AUTH_ACCOUNT_DISABLED: "AUTH_ACCOUNT_DISABLED",
  AUTH_INTERNAL_ERROR: "AUTH_INTERNAL_ERROR",
};

export function publicAuthFailure(code: unknown): PublicAuthFailure {
  const internalCode = typeof code === "string" ? code.trim().toUpperCase() : "";
  return failures[internalCodeMap[internalCode] ?? "AUTH_INTERNAL_ERROR"];
}

export function authCorrelationId(request: Request) {
  const supplied = request.headers.get("x-correlation-id") || request.headers.get("x-request-id");
  return supplied?.trim().slice(0, 160) || `auth-${randomUUID()}`;
}

export function authNoStoreHeaders(correlationId: string) {
  return {
    "Cache-Control": "no-store, private",
    Pragma: "no-cache",
    "X-Correlation-Id": correlationId,
  };
}

export function publicAuthErrorBody(code: unknown, correlationId: string, extra?: Record<string, unknown>) {
  const failure = publicAuthFailure(code);
  return {
    success: false,
    error: failure.code,
    code: failure.code,
    message: failure.messageKey,
    correlationId,
    ...extra,
  };
}
