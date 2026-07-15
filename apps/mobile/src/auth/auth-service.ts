import { acceptInvitationCodeRequest, acceptInvitationRequest, loginRequest, logoutRequest, meRequest, registerRequest, verifyMfaLoginRequest } from "@/api/auth-api";
import { isAuthenticationRejection } from "@/api/api-errors";
import { useAuthStore } from "@/auth/auth-store";
import { clearMobileRuntimeSessionState, clearMobileSessionState } from "@/auth/session-cleanup";
import { normalizeAuthTokens } from "@/auth/token-normalizer";
import { readMfaTrustedDeviceToken, readTokens, saveMfaTrustedDeviceToken, saveTokens } from "@/storage/secure-storage";
import { getOrCreateDeviceId } from "@/storage/device-storage";
import type { AuthSessionPayload, MfaLoginChallengePayload } from "@/types/api";

type BackendAdminSession = {
  isAdmin?: boolean;
  isPlatformAdmin?: boolean;
  user: {
    isAdmin?: boolean;
    isPlatformAdmin?: boolean;
  };
};

function resolveBackendAdminFlag(session: BackendAdminSession) {
  return session.isAdmin === true || session.isPlatformAdmin === true || session.user.isAdmin === true || session.user.isPlatformAdmin === true;
}

function isMfaChallenge(value: AuthSessionPayload | MfaLoginChallengePayload): value is MfaLoginChallengePayload {
  return "mfaRequired" in value && value.mfaRequired === true;
}

async function applyAuthenticatedSession(session: AuthSessionPayload, invitationToken?: string, invitationCode?: string) {
  if (session.trustedDeviceToken) await saveMfaTrustedDeviceToken(session.trustedDeviceToken);
  let tokens = normalizeAuthTokens(session.tokens);
  await saveTokens(tokens);
  if (invitationToken || invitationCode) {
    useAuthStore.getState().setTokens(tokens);
    try {
      const accepted = invitationToken
        ? await acceptInvitationRequest(invitationToken)
        : await acceptInvitationCodeRequest(invitationCode!);
      tokens = normalizeAuthTokens(accepted.tokens);
      await saveTokens(tokens);
      useAuthStore.getState().setTokens(tokens);
      const acceptedSession = await meRequest();
      const isPlatformAdmin = resolveBackendAdminFlag(acceptedSession);
      useAuthStore.getState().setSession({ ...acceptedSession, permissions: acceptedSession.permissions ?? [], isPlatformAdmin, user: { ...acceptedSession.user, role: acceptedSession.role, isPlatformAdmin }, tokens });
      return;
    } catch (error) {
      await clearMobileSessionState();
      throw error;
    }
  }
  const isPlatformAdmin = resolveBackendAdminFlag(session);
  useAuthStore.getState().setSession({ ...session, permissions: session.permissions ?? [], isPlatformAdmin, user: { ...session.user, isPlatformAdmin }, tokens });
}

export async function login(identifier: string, password: string, invitationToken?: string, invitationCode?: string) {
  const deviceId = await getOrCreateDeviceId();
  const trustedDeviceToken = await readMfaTrustedDeviceToken();
  const session = await loginRequest({ identifier, password, deviceId, ...(trustedDeviceToken ? { trustedDeviceToken } : {}) });
  if (isMfaChallenge(session)) return session;
  await applyAuthenticatedSession(session, invitationToken, invitationCode);
  return null;
}

export async function completeMfaLogin(
  challenge: MfaLoginChallengePayload,
  code: string,
  rememberDevice: boolean,
  invitationToken?: string,
  invitationCode?: string,
) {
  const deviceId = await getOrCreateDeviceId();
  const session = await verifyMfaLoginRequest({ challengeToken: challenge.challengeToken, code, rememberDevice, deviceId, deviceName: "Android" });
  await applyAuthenticatedSession(session, invitationToken, invitationCode);
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
  invitationToken?: string;
  invitationCode?: string;
}) {
  const deviceId = await getOrCreateDeviceId();
  const session = await registerRequest({ ...input, deviceId });
  const tokens = normalizeAuthTokens(session.tokens);
  await saveTokens(tokens);
  const isPlatformAdmin = resolveBackendAdminFlag(session);
  useAuthStore.getState().setSession({ ...session, permissions: session.permissions ?? [], isPlatformAdmin, user: { ...session.user, isPlatformAdmin }, tokens });
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
    const isPlatformAdmin = resolveBackendAdminFlag(session);
    useAuthStore.getState().setSession({ ...session, permissions: session.permissions ?? [], isPlatformAdmin, user: { ...session.user, role: session.role, isPlatformAdmin }, tokens });
  } catch (error) {
    if (isAuthenticationRejection(error)) {
      await clearMobileSessionState();
      return;
    }

    clearMobileRuntimeSessionState();
    throw error;
  }
}

export async function logout() {
  const refreshToken = useAuthStore.getState().tokens?.refreshToken ? (await readTokens())?.refreshToken : undefined;

  try {
    if (refreshToken) await logoutRequest(refreshToken);
  } finally {
    await clearMobileSessionState();
  }
}
