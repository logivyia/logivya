import { loginRequest, logoutRequest, meRequest, registerRequest } from "@/api/auth-api";
import { useAuthStore } from "@/auth/auth-store";
import { clearMobileSessionState } from "@/auth/session-cleanup";
import { readTokens, saveTokens } from "@/storage/secure-storage";
import { getOrCreateDeviceId } from "@/storage/device-storage";

export async function login(identifier: string, password: string) {
  const deviceId = await getOrCreateDeviceId();
  const session = await loginRequest({ identifier, password, deviceId });
  await saveTokens(session.tokens);
  useAuthStore.getState().setSession(session);
}

export async function register(input: {
  fullName: string;
  email: string;
  phone?: string;
  companyName?: string;
  password: string;
  passwordConfirmation: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  acceptKvkk: boolean;
  marketingConsent?: boolean;
}) {
  const deviceId = await getOrCreateDeviceId();
  const session = await registerRequest({ ...input, deviceId });
  await saveTokens(session.tokens);
  useAuthStore.getState().setSession(session);
}

export async function restoreSession() {
  const tokens = await readTokens();
  if (!tokens) {
    useAuthStore.getState().clearSession();
    return;
  }

  useAuthStore.getState().setTokens(tokens);

  try {
    const session = await meRequest();
    useAuthStore.getState().setSession({ ...session, user: { ...session.user, role: session.role }, tokens });
  } catch {
    await clearMobileSessionState();
  }
}

export async function logout() {
  const refreshToken = useAuthStore.getState().tokens?.refreshToken ?? (await readTokens())?.refreshToken;

  try {
    if (refreshToken) await logoutRequest(refreshToken);
  } finally {
    await clearMobileSessionState();
  }
}
