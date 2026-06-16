import { useAuthStore } from "@/auth/auth-store";
import { config } from "@/constants/config";
import { trackEvent } from "@/services/analytics";
import { captureAppError } from "@/services/crash-reporting";
import { readTokens, saveTokens } from "@/storage/secure-storage";
import type { AuthTokens, MobileApiResponse } from "@/types/api";

type ApiOptions = RequestInit & {
  auth?: boolean;
  retry?: boolean;
};

class MobileApiClient {
  private refreshPromise: Promise<AuthTokens | null> | null = null;

  async request<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const shouldAuth = options.auth !== false;
    const headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");
    headers.set("Accept", "application/json");

    if (shouldAuth) {
      let tokens = useAuthStore.getState().tokens ?? (await readTokens());
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
      const error = new Error("Sunucudan gecersiz yanit alindi.");
      this.reportApiError(error, path, response.status, "INVALID_RESPONSE");
      throw error;
    }

    if (!payload.success) {
      const error = new Error(payload.error.message || "Islem tamamlanamadi.");
      this.reportApiError(error, path, response.status, payload.error.code);
      throw error;
    }

    return payload.data;
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

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

      try {
        return await fetch(`${config.apiBaseUrl}${path}`, {
          ...options,
          signal: controller.signal
        });
      } catch (error) {
        lastError = error;
        if (attempt === attempts) break;
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      } finally {
        clearTimeout(timeout);
      }
    }

    const error = lastError instanceof Error ? lastError : new Error("Ag baglantisi kurulamadi.");
    this.reportApiError(error, path, 0, "NETWORK_ERROR");
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
        await saveTokens(response.tokens);
        useAuthStore.getState().setTokens(response.tokens);
        return response.tokens;
      } catch {
        return null;
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

  private reportApiError(error: Error, path: string, status: number, code: string) {
    const context = { path, status, code };
    void trackEvent("mobile_api_error", context);

    if (status === 0 || status === 401 || status >= 500) {
      captureAppError(error, context);
    }
  }
}

export const apiClient = new MobileApiClient();
