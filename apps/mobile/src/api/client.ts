import { config } from "@/constants/config";
import { useAuthStore } from "@/auth/auth-store";
import { clearTokens, readTokens, saveTokens } from "@/storage/secure-storage";
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
      const token = useAuthStore.getState().tokens?.accessToken ?? (await readTokens())?.accessToken;
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await this.fetchWithRetry(path, { ...options, headers });

    if (response.status === 401 && shouldAuth) {
      const refreshed = await this.refreshTokens();
      if (refreshed) return this.request<T>(path, { ...options, retry: false });
      await this.forceLogout();
    }

    const payload = (await response.json().catch(() => null)) as MobileApiResponse<T> | null;

    if (!payload) {
      throw new Error("Sunucudan geçersiz yanıt alındı.");
    }

    if (!payload.success) {
      throw new Error(payload.error.message || "İşlem tamamlanamadı.");
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

    throw lastError instanceof Error ? lastError : new Error("Ağ bağlantısı kurulamadı.");
  }

  private async refreshTokens() {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      const storedTokens = await readTokens();
      if (!storedTokens?.refreshToken) return null;

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
    await clearTokens();
    useAuthStore.getState().clearSession();
  }
}

export const apiClient = new MobileApiClient();
