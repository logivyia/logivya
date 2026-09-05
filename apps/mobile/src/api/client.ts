import { useAuthStore } from "@/auth/auth-store";
import { useSettingsStore } from "@/auth/settings-store";
import { ApiRequestError, isAuthenticationRejection } from "@/api/api-errors";
import { normalizeAuthTokens } from "@/auth/token-normalizer";
import { config } from "@/constants/config";
import { translateCurrent } from "@/i18n/runtime";
import { trackEvent } from "@/services/analytics";
import { captureAppError } from "@/services/crash-reporting";
import { getCurrentMobileRecoveryId } from "@/services/mobile-recovery-context";
import { readTokens, saveTokens } from "@/storage/secure-storage";
import type { AuthTokens, MobileApiResponse } from "@/types/api";
import { getMobilePlatform } from "@/utils/device";
import { fetch as expoFetch } from "expo/fetch";
import { File } from "expo-file-system";

type ApiOptions = RequestInit & {
  auth?: boolean;
  retry?: boolean;
  hostFallback?: boolean;
  timeoutMs?: number;
};

function isMultipartBody(body: BodyInit | null | undefined) {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

function createRequestId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function addObservabilityHeaders(headers: Headers) {
  const requestId = headers.get("X-Request-Id") || createRequestId("mob");
  const recoveryId = getCurrentMobileRecoveryId();
  headers.set("X-Request-Id", requestId);
  headers.set("X-Correlation-Id", headers.get("X-Correlation-Id") || requestId);
  if (recoveryId) headers.set("X-Client-Recovery-Id", recoveryId);
  headers.set("X-Client-Platform", getMobilePlatform());
  headers.set("X-Logivya-App-Version", config.appVersion);
  headers.set("X-Logivya-Version-Code", String(config.versionCode));
  headers.set("X-Logivya-Build-Marker", config.buildMarker);
  headers.set("X-Logivya-Release-Id", config.releaseId);
  headers.set("X-Logivya-Api-Contract", config.apiContractVersion);
}

function messageForApiError(code: string, status: number, fallback?: string) {
  if (code === "AUTH_INVALID_CREDENTIALS") return translateCurrent("invalidCredentialsError");
  if (code === "AUTH_MFA_CODE_INVALID") return translateCurrent("mfaCodeInvalidError");
  if (code === "AUTH_MFA_CODE_REUSED") return translateCurrent("mfaCodeReusedError");
  if (code === "AUTH_MFA_CHALLENGE_EXPIRED") return translateCurrent("mfaChallengeExpiredError");
  if (code === "AUTH_MFA_RATE_LIMITED") return translateCurrent("mfaRateLimitedError");
  if (code === "AUTH_SESSION_CREATE_FAILED") return translateCurrent("authSessionCreateFailedError");
  if (code === "AUTH_METHOD_UNAVAILABLE") return translateCurrent("authMethodUnavailableError");
  if (code === "AUTH_INTERNAL_ERROR") return translateCurrent("authInternalError");
  if (code === "MFA_INVALID" || code === "INVALID_TOTP_CODE" || code === "MFA_EMAIL_OTP_INVALID") return translateCurrent("mfaCodeInvalidError");
  if (code === "MFA_CODE_REUSED") return translateCurrent("mfaCodeReusedError");
  if (code === "MFA_EMAIL_OTP_EXPIRED") return translateCurrent("mfaChallengeExpiredError");
  if (code === "PASSWORD_CONFIRMATION_REQUIRED") return translateCurrent("passwordRequired");
  if (code === "MFA_METHOD_NOT_ENABLED") return translateCurrent("mfaDisabled");
  if (code === "MFA_METHOD_REQUIRED_BY_POLICY") return translateCurrent("mfaPolicyActionRequired");
  if (code === "RECENT_AUTHENTICATION_REQUIRED") return translateCurrent("mfaCodeInvalidError");
  if (code === "MFA_DEVICE_MISMATCH") return translateCurrent("mfaChallengeExpiredError");
  if (code === "MFA_CHALLENGE_INVALID") return translateCurrent("loginFailed");
  if (code === "MFA_CHALLENGE_LOCKED" || code === "RATE_LIMITED") return translateCurrent("operationFailedError");
  if (code === "PASSWORD_REQUIRED") return translateCurrent("passwordRequired");
  if (code === "PASSWORD_TOO_SHORT") return translateCurrent("passwordTooShort");
  if (code === "PASSWORD_CONFIRMATION_MISMATCH") return translateCurrent("passwordConfirmationMismatch");
  if (code === "PASSWORD_INVALID_TYPE") return translateCurrent("passwordInvalidType");
  if (code === "REGISTRATION_FAILED") return translateCurrent("registrationFailed");
  if (code === "EMAIL_ALREADY_REGISTERED") return translateCurrent("accountExistsError");
  if (code === "SUBSCRIPTION_LOCKED") return translateCurrent("subscriptionInactiveError");
  if (code === "WHATSAPP_SEND_PAUSED") return translateCurrent("whatsappSendPaused");
  if (code === "WHATSAPP_SEND_SAFETY_UNAVAILABLE") return translateCurrent("whatsappSendSafetyUnavailable");
  if (code === "BILLING_PROFILE_INCOMPLETE") return translateCurrent("billingProfileIncompleteError");
  if (code === "PROFILE_FIRST_NAME_MISSING") return translateCurrent("billing.manual.profileFirstNameMissing");
  if (code === "PROFILE_LAST_NAME_MISSING") return translateCurrent("billing.manual.profileLastNameMissing");
  if (code === "PROFILE_EMAIL_MISSING") return translateCurrent("billing.manual.profileEmailMissing");
  if (code === "ACTIVE_SUBSCRIPTION_REQUEST_EXISTS") return translateCurrent("billing.manual.duplicatePending");
  if (code === "IMMEDIATE_PERFORMANCE_CONSENT_REQUIRED") return translateCurrent("billingLegalConsentRequiredError");
  if (code === "LEGAL_SELLER_CONFIGURATION_INCOMPLETE") return translateCurrent("billingCheckoutUnavailableError");
  if (code === "LEGAL_CONSENT_REQUIRED") return translateCurrent("billingLegalConsentRequiredError");
  if (code === "SEAT_LIMIT_REACHED") return translateCurrent("userSeatLimitReachedError");
  if (code === "FIRST_NAME_REQUIRED") return translateCurrent("firstNameRequiredError");
  if (code === "LAST_NAME_REQUIRED") return translateCurrent("lastNameRequiredError");
  if (code === "EMAIL_NOT_AVAILABLE") return translateCurrent("emailNotAvailableError");
  if (code === "USER_ALREADY_IN_TENANT") return translateCurrent("alreadyMemberError");
  if (code === "ALREADY_MEMBER") return translateCurrent("alreadyMemberError");
  if (code === "INVITATION_ALREADY_PENDING") return translateCurrent("invitationAlreadyPendingError");
  if (code === "SELF_INVITATION") return translateCurrent("selfInvitationError");
  if (code === "INVALID_EMAIL") return translateCurrent("invalidInvitationEmailError");
  if (code === "INVITATION_NAME_REQUIRED") return translateCurrent("nameFieldsRequiredError");
  if (code === "INVITATION_PERMISSION_DENIED") return translateCurrent("invitationPermissionDeniedError");
  if (code === "INVITATION_DELIVERY_CONFIGURATION_ERROR") return translateCurrent("invitationDeliveryConfigurationError");
  if (code === "INVITATION_REQUEST_FAILED") return translateCurrent("invitationRequestFailedError");
  if (
    code === "MEMBER_SELF_MANAGED_AFTER_ACTIVATION" ||
    code === "PENDING_MEMBER_MANAGEMENT_ONLY" ||
    code === "MEMBER_ALREADY_ACTIVATED"
  ) return translateCurrent("usersReadOnlySharedMembership");
  if (
    code === "ACTIVE_SHARED_MEMBERSHIP_EXISTS" ||
    code === "SHARED_SUBSCRIPTION_READ_ONLY"
  ) return translateCurrent("sharedSubscriptionReadOnly");
  if (code === "TENANT_DELETE_FORBIDDEN") {
    return translateCurrent("sharedMembershipDeleteScope");
  }
  if (
    code === "USER_MANAGEMENT_FORBIDDEN" ||
    code === "INDEPENDENT_CONVERSION_NOT_ALLOWED"
  ) return translateCurrent("operationForbiddenError");
  if (code === "MESSAGING_PERMISSION_DENIED") return translateCurrent("messagingPermissionDeniedError");
  if (code === "INVALID_WHATSAPP_PHONE" || code === "PHONE_COUNTRY_MISMATCH") {
    return translateCurrent("internationalPhoneInvalid");
  }
  if (code === "UNSUPPORTED_PHONE_COUNTRY") return translateCurrent("phoneCountryUnsupported");
  if (code === "DUPLICATE_PHONE_COUNTRY_CODE") return translateCurrent("phoneCountryCodeDuplicate");
  if (code === "FREIGHT_LISTING_NOT_FOUND") return translateCurrent("freightDetailsFailed");
  if (code === "VEHICLE_LISTING_NOT_FOUND") return translateCurrent("vehicleDetailFailed");
  if (code === "DRIVER_LISTING_NOT_FOUND") return translateCurrent("driverDetailFailed");
  if (code === "FREIGHT_LISTING_NOT_EDITABLE") return translateCurrent("freightNotEditable");
  if (code === "FREIGHT_STATUS_TRANSITION_INVALID") return translateCurrent("freightStatusTransitionInvalid");
  if (code === "FREIGHT_INVALID_DATE") return translateCurrent("freightDateRequired");
  if (code === "FREIGHT_LOADING_DATE_PAST") return translateCurrent("freightDatePast");
  if (code === "FREIGHT_INVALID_PHONE") return translateCurrent("freightPhoneRequired");
  if (code === "FREIGHT_CURRENCY_REQUIRED") return translateCurrent("freightCurrencyRequired");
  if (code === "MARKETPLACE_DATE_RANGE_INVALID") return translateCurrent("marketplaceDateRangeInvalid");
  if (
    code === "WHATSAPP_WORKER_UNAVAILABLE"
    || code === "MESSAGE_QUEUE_UNAVAILABLE"
    || code === "MESSAGE_QUEUE_NO_CONSUMER"
    || code === "MESSAGE_QUEUE_PAUSED"
  ) return translateCurrent("whatsappServiceUnavailableError");
  if (code === "UPLOAD_FILE_SIZE_NOT_ALLOWED" || code === "UPLOAD_FILE_SIZE_MISMATCH" || code === "UPLOAD_REQUEST_TOO_LARGE") {
    return translateCurrent("whatsAppAttachmentTooLarge");
  }
  if (code.startsWith("UPLOAD_") || code === "MEDIA_STORAGE_KEY_INVALID") {
    return translateCurrent("attachmentUploadFailed");
  }
  if (code === "NETWORK_TIMEOUT") return translateCurrent("networkTimeoutError");
  if (code === "SSL_ERROR") return translateCurrent("secureConnectionError");
  if (code === "DNS_ERROR") return translateCurrent("dnsError");
  if (code === "SERVER_UNREACHABLE" || code === "NETWORK_ERROR" || status === 0) return translateCurrent("serverUnreachableError");
  if (code === "UNAUTHORIZED" || status === 401) return translateCurrent("invalidCredentialsError");
  if (code === "FORBIDDEN" || status === 403) return translateCurrent("operationForbiddenError");
  if (code === "VALIDATION_ERROR" || status === 400) return translateCurrent("invalidInputError");
  if (code === "ACCOUNT_EXISTS" || status === 409) return translateCurrent("accountExistsError");
  if (code === "CONFIGURATION_ERROR" || status === 503) return translateCurrent("serviceConfigurationError");
  if (status >= 500) return translateCurrent("serverError");
  return fallback || translateCurrent("operationFailedError");
}

function safeBodyKeys(body: BodyInit | null | undefined) {
  if (typeof body !== "string") return undefined;
  try {
    return Object.keys(JSON.parse(body)).filter((key) => !["password", "passwordConfirmation", "confirmPassword"].includes(key));
  } catch {
    return undefined;
  }
}

function uniqueBaseUrls(urls: string[]) {
  return urls.filter((url, index) => url && urls.indexOf(url) === index);
}

function methodFor(options: ApiOptions) {
  return (options.method || "GET").toUpperCase();
}

function canUseHostFallback(path: string, options: ApiOptions) {
  if (options.hostFallback === false) return false;
  const method = methodFor(options);
  if (path === "/api/mobile/auth/login" || path === "/api/mobile/auth/mfa/verify") return true;
  return method === "GET";
}

function buildApiUrl(baseUrl: string, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/, "")}${normalizedPath}`;
}

function resolvedResponseBaseUrl(response: Response, attemptedBaseUrl: string) {
  try {
    return response.url ? new URL(response.url).origin : attemptedBaseUrl;
  } catch {
    return attemptedBaseUrl;
  }
}

function diagnoseNetworkError(error: unknown, timedOut: boolean) {
  const message = error instanceof Error ? error.message : String(error || "");
  const lower = message.toLowerCase();

  if (timedOut || (error instanceof Error && error.name === "AbortError")) {
    return { code: "NETWORK_TIMEOUT", reason: "timeout", nativeMessage: message };
  }

  if (lower.includes("ssl") || lower.includes("certificate") || lower.includes("cert path")) {
    return { code: "SSL_ERROR", reason: "ssl", nativeMessage: message };
  }

  if (lower.includes("unable to resolve host") || lower.includes("enotfound") || lower.includes("dns")) {
    return { code: "DNS_ERROR", reason: "dns", nativeMessage: message };
  }

  if (lower.includes("network request failed") || lower.includes("failed to fetch")) {
    return { code: "SERVER_UNREACHABLE", reason: "unreachable", nativeMessage: message };
  }

  return { code: "NETWORK_ERROR", reason: "unknown", nativeMessage: message };
}

class MobileApiClient {
  private refreshPromise: Promise<AuthTokens | null> | null = null;
  private activeBaseUrl: string | null = null;

  async request<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const shouldAuth = options.auth !== false;
    const headers = new Headers(options.headers);
    if (!isMultipartBody(options.body)) headers.set("Content-Type", "application/json");
    headers.set("Accept", "application/json");
    const locale = useSettingsStore.getState().locale;
    headers.set("Accept-Language", locale);
    headers.set("X-Logivya-Locale", locale);
    addObservabilityHeaders(headers);

    if (shouldAuth) {
      let tokens = useAuthStore.getState().tokens ? await readTokens() : null;
      if (tokens && this.isTokenExpiringSoon(tokens.accessTokenExpiresAt)) {
        tokens = await this.refreshTokens();
      }

      if (tokens?.accessToken) headers.set("Authorization", `Bearer ${tokens.accessToken}`);
    }

    const response = await this.fetchWithRetry(path, { ...options, headers });

    if (response.status === 401 && shouldAuth) {
      const refreshed = await this.refreshTokens();
      if (refreshed) return this.request<T>(path, { ...options, retry: false });
      await this.forceLogout();
    }

    const payload = (await response.json().catch(() => null)) as MobileApiResponse<T> | null;

    if (!payload) {
      const error = new Error(translateCurrent("invalidServerResponseError"));
      this.reportApiError(error, path, response.status, "INVALID_RESPONSE");
      throw error;
    }

    if (!payload.success) {
      const message = messageForApiError(payload.error.code, response.status, payload.error.message);
      const error = new ApiRequestError(message, payload.error.code, response.status, path);
      this.reportApiError(error, path, response.status, payload.error.code, options);
      throw error;
    }

    return payload.data;
  }

  async requestRaw<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const shouldAuth = options.auth !== false;
    const headers = new Headers(options.headers);
    if (!isMultipartBody(options.body)) headers.set("Content-Type", "application/json");
    headers.set("Accept", "application/json");
    const locale = useSettingsStore.getState().locale;
    headers.set("Accept-Language", locale);
    headers.set("X-Logivya-Locale", locale);
    addObservabilityHeaders(headers);

    if (shouldAuth) {
      let tokens = useAuthStore.getState().tokens ? await readTokens() : null;
      if (tokens && this.isTokenExpiringSoon(tokens.accessTokenExpiresAt)) {
        tokens = await this.refreshTokens();
      }

      if (tokens?.accessToken) headers.set("Authorization", `Bearer ${tokens.accessToken}`);
    }

    const response = await this.fetchWithRetry(path, { ...options, headers });

    if (response.status === 401 && shouldAuth) {
      const refreshed = await this.refreshTokens();
      if (refreshed) return this.requestRaw<T>(path, { ...options, retry: false });
      await this.forceLogout();
    }

    const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
    if (!response.ok) {
      const errorCode = typeof payload === "object" && payload && "error" in payload ? String(payload.error) : "REQUEST_FAILED";
      const error = new ApiRequestError(messageForApiError(errorCode, response.status), errorCode, response.status, path);
      this.reportApiError(error, path, response.status, errorCode, options);
      throw error;
    }

    if (!payload) {
      const error = new Error(translateCurrent("invalidServerResponseError"));
      this.reportApiError(error, path, response.status, "INVALID_RESPONSE");
      throw error;
    }

    return payload as T;
  }

  async uploadFile<T>(
    path: string,
    fileUri: string,
    extraHeaders: Record<string, string>,
    retryAfterRefresh = true,
    signal?: AbortSignal,
  ): Promise<T> {
    const headers = new Headers(extraHeaders);
    const nativeFile = new File(fileUri);
    if (!nativeFile.exists || nativeFile.size <= 0) {
      throw new ApiRequestError(translateCurrent("attachmentUploadFailed"), "UPLOAD_FILE_REQUIRED", 0, path);
    }
    headers.delete("Content-Length");
    headers.set("X-File-Size", String(nativeFile.size));
    if (nativeFile.type && !headers.has("Content-Type")) headers.set("Content-Type", nativeFile.type);
    headers.set("Accept", "application/json");
    const locale = useSettingsStore.getState().locale;
    headers.set("Accept-Language", locale);
    headers.set("X-Logivya-Locale", locale);
    addObservabilityHeaders(headers);

    let tokens = useAuthStore.getState().tokens ? await readTokens() : null;
    if (tokens && this.isTokenExpiringSoon(tokens.accessTokenExpiresAt)) {
      tokens = await this.refreshTokens();
    }
    if (tokens?.accessToken) headers.set("Authorization", `Bearer ${tokens.accessToken}`);

    const nativeHeaders: Record<string, string> = {};
    headers.forEach((value, key) => {
      nativeHeaders[key] = value;
    });
    const baseUrl = this.activeBaseUrl || config.apiBaseUrl;
    const url = buildApiUrl(baseUrl, path);

    let result: Response;
    try {
      result = await expoFetch(url, {
        method: "PUT",
        headers: nativeHeaders,
        body: nativeFile,
        ...(signal ? { signal } : {}),
      }) as Response;
    } catch (cause) {
      if (signal?.aborted) {
        throw new ApiRequestError(translateCurrent("attachmentUploadCanceled"), "UPLOAD_CANCELED", 0, path);
      }
      const diagnosis = diagnoseNetworkError(cause, false);
      const error = new ApiRequestError(messageForApiError(diagnosis.code, 0), diagnosis.code, 0, path);
      this.reportApiError(cause instanceof Error ? cause : error, path, 0, diagnosis.code, { method: "PUT" }, {
        nativeMessage: diagnosis.nativeMessage,
        attemptedUrls: [url],
      });
      throw error;
    }

    if (result.status === 401 && retryAfterRefresh) {
      const refreshed = await this.refreshTokens();
      if (refreshed) return this.uploadFile<T>(path, fileUri, extraHeaders, false, signal);
      await this.forceLogout();
    }

    const resolvedPayload = await result.json().catch(() => null) as MobileApiResponse<T> | null;
    if (!resolvedPayload) {
      const error = new Error(translateCurrent("invalidServerResponseError"));
      this.reportApiError(error, path, result.status, "INVALID_RESPONSE", { method: "PUT" });
      throw error;
    }
    if (!resolvedPayload.success) {
      const message = messageForApiError(resolvedPayload.error.code, result.status, resolvedPayload.error.message);
      const error = new ApiRequestError(message, resolvedPayload.error.code, result.status, path);
      this.reportApiError(error, path, result.status, resolvedPayload.error.code, { method: "PUT" });
      throw error;
    }

    this.activeBaseUrl = baseUrl;
    return resolvedPayload.data;
  }

  async download(path: string, extraHeaders: Record<string, string>) {
    const headers = new Headers(extraHeaders);
    headers.set("Accept", "application/json");
    const locale = useSettingsStore.getState().locale;
    headers.set("Accept-Language", locale);
    headers.set("X-Logivya-Locale", locale);
    addObservabilityHeaders(headers);
    let tokens = await readTokens();
    if (tokens && this.isTokenExpiringSoon(tokens.accessTokenExpiresAt)) tokens = await this.refreshTokens();
    if (tokens?.accessToken) headers.set("Authorization", `Bearer ${tokens.accessToken}`);

    let response = await this.fetchWithRetry(path, { method: "GET", headers, retry: false });
    if (response.status === 401) {
      tokens = await this.refreshTokens();
      if (!tokens?.accessToken) {
        await this.forceLogout();
        throw new ApiRequestError(messageForApiError("UNAUTHORIZED", 401), "UNAUTHORIZED", 401, path);
      }
      headers.set("Authorization", `Bearer ${tokens.accessToken}`);
      response = await this.fetchWithRetry(path, { method: "GET", headers, retry: false });
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      const code = payload?.error || "REQUEST_FAILED";
      throw new ApiRequestError(messageForApiError(code, response.status), code, response.status, path);
    }
    return response.arrayBuffer();
  }

  async post<T, B extends Record<string, unknown> = Record<string, unknown>>(path: string, body: B, options?: ApiOptions) {
    return this.request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
      ...options
    });
  }

  async patch<T, B extends Record<string, unknown> = Record<string, unknown>>(path: string, body: B, options?: ApiOptions) {
    return this.request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
      ...options
    });
  }

  async delete<T>(path: string, options?: ApiOptions) {
    return this.request<T>(path, {
      method: "DELETE",
      ...options
    });
  }

  private async fetchWithRetry(path: string, options: ApiOptions) {
    const attempts = options.retry === false ? 1 : config.retryCount + 1;
    let lastError: unknown;
    let lastDiagnosis = diagnoseNetworkError(undefined, false);
    const attemptedUrls: string[] = [];
    const primaryBaseUrl = this.activeBaseUrl || config.apiBaseUrl;
    const baseUrls = canUseHostFallback(path, options)
      ? uniqueBaseUrls([primaryBaseUrl, config.apiBaseUrl, ...config.apiFallbackBaseUrls])
      : [primaryBaseUrl];

    for (const baseUrl of baseUrls) {
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const controller = new AbortController();
        let didTimeout = false;
        const timeout = setTimeout(() => {
          didTimeout = true;
          controller.abort();
        }, options.timeoutMs ?? config.requestTimeoutMs);

        const url = buildApiUrl(baseUrl, path);
        attemptedUrls.push(url);

        try {
          const fetchOptions = { ...options };
          delete fetchOptions.auth;
          delete fetchOptions.retry;
          delete fetchOptions.hostFallback;
          delete fetchOptions.timeoutMs;
          const response = await fetch(url, {
            ...fetchOptions,
            signal: controller.signal
          });
          this.activeBaseUrl = resolvedResponseBaseUrl(response, baseUrl);
          return response;
        } catch (error) {
          lastError = error;
          lastDiagnosis = diagnoseNetworkError(error, didTimeout);
          if (attempt < attempts) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 500));
          }
        } finally {
          clearTimeout(timeout);
        }
      }
    }

    const message = messageForApiError(lastDiagnosis.code, 0);
    const error = new ApiRequestError(message, lastDiagnosis.code, 0, path);
    this.reportApiError(lastError instanceof Error ? lastError : error, path, 0, lastDiagnosis.code, options, {
      networkReason: lastDiagnosis.reason,
      nativeMessage: lastDiagnosis.nativeMessage,
      attemptedUrls
    });
    throw error;
  }

  private async refreshTokens() {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      const storedTokens = await readTokens();
      if (!storedTokens?.refreshToken) return null;
      if (this.isTokenExpired(storedTokens.refreshTokenExpiresAt)) {
        await this.forceLogout();
        return null;
      }

      try {
        const response = await this.post<{ tokens: AuthTokens }>(
          "/api/mobile/auth/refresh",
          { refreshToken: storedTokens.refreshToken },
          { auth: false, retry: false }
        );
        const tokens = normalizeAuthTokens(response.tokens);
        await saveTokens(tokens);
        useAuthStore.getState().setTokens(tokens);
        return tokens;
      } catch (error) {
        if (isAuthenticationRejection(error)) {
          await this.forceLogout();
          return null;
        }
        throw error;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private async forceLogout() {
    const { clearMobileSessionState } = await import("@/auth/session-cleanup");
    await clearMobileSessionState();
  }

  private isTokenExpired(expiresAt?: string | null) {
    if (!expiresAt) return true;
    const expiresAtMs = Date.parse(expiresAt);
    return Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now();
  }

  private isTokenExpiringSoon(expiresAt?: string | null) {
    if (!expiresAt) return true;
    const expiresAtMs = Date.parse(expiresAt);
    return Number.isNaN(expiresAtMs) || expiresAtMs - Date.now() < 60_000;
  }

  private reportApiError(error: Error, path: string, status: number, code: string, options?: ApiOptions, extra?: Record<string, unknown>) {
    const context = {
      path,
      url: buildApiUrl(this.activeBaseUrl || config.apiBaseUrl, path),
      status,
      code,
      method: options?.method || "GET",
      auth: options?.auth !== false,
      bodyKeys: safeBodyKeys(options?.body),
      ...extra
    };
    void trackEvent("mobile_api_error", context);

    if (status === 0 || status === 401 || status >= 500) {
      captureAppError(error, context);
    }
  }
}

export const apiClient = new MobileApiClient();
