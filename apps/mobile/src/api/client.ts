import { useAuthStore } from "@/auth/auth-store";
import { useSettingsStore } from "@/auth/settings-store";
import { ApiRequestError, isAuthenticationRejection } from "@/api/api-errors";
import { normalizeAuthTokens } from "@/auth/token-normalizer";
import { config } from "@/constants/config";
import { translateCurrent } from "@/i18n/runtime";
import { trackEvent } from "@/services/analytics";
import { captureAppError } from "@/services/crash-reporting";
import { readTokens, saveTokens } from "@/storage/secure-storage";
import type { AuthTokens, MobileApiResponse } from "@/types/api";

type ApiOptions = RequestInit & {
  auth?: boolean;
  retry?: boolean;
  hostFallback?: boolean;
};

function createRequestId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function addObservabilityHeaders(headers: Headers) {
  const requestId = headers.get("X-Request-Id") || createRequestId("mob");
  headers.set("X-Request-Id", requestId);
  headers.set("X-Correlation-Id", headers.get("X-Correlation-Id") || requestId);
  headers.set("X-Client-Platform", "android");
  headers.set("X-Logivya-App-Version", config.appVersion);
  headers.set("X-Logivya-Version-Code", String(config.versionCode));
  headers.set("X-Logivya-Build-Marker", config.buildMarker);
}

function messageForApiError(code: string, status: number, fallback?: string) {
  if (code === "MFA_INVALID" || code === "MFA_CODE_REUSED") return translateCurrent("mfaSubtitle");
  if (code === "MFA_CHALLENGE_INVALID") return translateCurrent("loginFailed");
  if (code === "MFA_CHALLENGE_LOCKED" || code === "RATE_LIMITED") return translateCurrent("operationFailedError");
  if (code === "PASSWORD_REQUIRED") return translateCurrent("passwordRequired");
  if (code === "PASSWORD_TOO_SHORT") return translateCurrent("passwordTooShort");
  if (code === "PASSWORD_CONFIRMATION_MISMATCH") return translateCurrent("passwordConfirmationMismatch");
  if (code === "PASSWORD_INVALID_TYPE") return translateCurrent("passwordInvalidType");
  if (code === "REGISTRATION_FAILED") return translateCurrent("registrationFailed");
  if (code === "EMAIL_ALREADY_REGISTERED") return translateCurrent("accountExistsError");
  if (code === "SUBSCRIPTION_LOCKED") return translateCurrent("subscriptionInactiveError");
  if (code === "MESSAGING_PERMISSION_DENIED") return translateCurrent("messagingPermissionDeniedError");
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
    headers.set("Content-Type", "application/json");
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
    headers.set("Content-Type", "application/json");
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
        }, config.requestTimeoutMs);

        const url = buildApiUrl(baseUrl, path);
        attemptedUrls.push(url);

        try {
          const response = await fetch(url, {
            ...options,
            signal: controller.signal
          });
          this.activeBaseUrl = baseUrl;
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
