import { acceptInvitationCodeRequest, acceptInvitationRequest, changeTemporaryPasswordRequest, loginRequest, logoutRequest, meRequest, registerRequest, resendMfaEmailCodeRequest, selectMfaLoginMethodRequest, socialLoginRequest, verifyMfaLoginRequest } from "@/api/auth-api";
import { ApiRequestError, isAuthenticationRejection } from "@/api/api-errors";
import { useAuthStore } from "@/auth/auth-store";
import { clearMobileSessionState } from "@/auth/session-cleanup";
import { normalizeAuthTokens } from "@/auth/token-normalizer";
import {
  clearPendingMfaChallenge,
  readMfaTrustedDeviceToken,
  readTokens,
  saveMfaTrustedDeviceToken,
  savePendingMfaChallenge,
  saveTokens,
} from "@/storage/secure-storage";
import { getOrCreateDeviceId } from "@/storage/device-storage";
import type { AuthSessionPayload, LoginResponsePayload, MfaLoginChallengePayload, PasswordChangeChallengePayload } from "@/types/api";
import { getMobilePlatform } from "@/utils/device";

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

function isMfaChallenge(value: LoginResponsePayload): value is MfaLoginChallengePayload {
  return "mfaRequired" in value && value.mfaRequired === true;
}

function isPasswordChangeChallenge(value: LoginResponsePayload): value is PasswordChangeChallengePayload {
  return "passwordChangeRequired" in value && value.passwordChangeRequired === true;
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
  if (isPasswordChangeChallenge(session)) return session;
  if (isMfaChallenge(session)) {
    await savePendingMfaChallenge(session);
    return session;
  }
  await clearPendingMfaChallenge();
  await applyAuthenticatedSession(session, invitationToken, invitationCode);
  return null;
}

export async function loginWithSocialIdentity(
  provider: "GOOGLE" | "APPLE",
  identityToken: string,
  nonce?: string,
  invitationToken?: string,
  invitationCode?: string,
) {
  const deviceId = await getOrCreateDeviceId();
  const trustedDeviceToken = await readMfaTrustedDeviceToken();
  const session = await socialLoginRequest({
    provider,
    identityToken,
    ...(nonce ? { nonce } : {}),
    deviceId,
    ...(trustedDeviceToken ? { trustedDeviceToken } : {}),
  });
  if (isPasswordChangeChallenge(session)) return session;
  if (isMfaChallenge(session)) {
    await savePendingMfaChallenge(session);
    return session;
  }
  await clearPendingMfaChallenge();
  await applyAuthenticatedSession(session, invitationToken, invitationCode);
  return null;
}

export async function completeInitialPasswordChange(
  challenge: PasswordChangeChallengePayload,
  temporaryPassword: string,
  newPassword: string,
  newPasswordConfirmation: string,
) {
  await changeTemporaryPasswordRequest({
    challengeToken: challenge.challengeToken,
    temporaryPassword,
    newPassword,
    newPasswordConfirmation,
  });
}

export async function completeMfaLogin(
  challenge: MfaLoginChallengePayload,
  code: string,
  rememberDevice: boolean,
  invitationToken?: string,
  invitationCode?: string,
) {
  const deviceId = await getOrCreateDeviceId();
  let session;
  try {
    session = await verifyMfaLoginRequest({
      challengeToken: challenge.challengeToken,
      code,
      rememberDevice,
      deviceId,
      deviceName: getMobilePlatform() === "IOS" ? "iPhone" : "Android",
      ...(challenge.setupToken ? { setupToken: challenge.setupToken } : {}),
    });
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === "AUTH_MFA_CHALLENGE_EXPIRED") {
      await clearPendingMfaChallenge();
    }
    throw error;
  }
  await clearPendingMfaChallenge();
  if (session.recoveryCodes?.length) return session;
  await applyAuthenticatedSession(session, invitationToken, invitationCode);
  return null;
}

export async function chooseMfaLoginMethod(challenge: MfaLoginChallengePayload, method: "TOTP" | "EMAIL_OTP") {
  const deviceId = await getOrCreateDeviceId();
  const result = await selectMfaLoginMethodRequest({ challengeToken: challenge.challengeToken, method, deviceId });
  const updated = { ...challenge, ...result, selectedMethod: method } as MfaLoginChallengePayload;
  await savePendingMfaChallenge(updated);
  return updated;
}

export async function resendMfaEmailCode(challenge: MfaLoginChallengePayload) {
  const deviceId = await getOrCreateDeviceId();
  const result = await resendMfaEmailCodeRequest({ challengeToken: challenge.challengeToken, deviceId });
  const updated = { ...challenge, ...result } as MfaLoginChallengePayload;
  await savePendingMfaChallenge(updated);
  return updated;
}

export async function finishMfaSetupLogin(
  session: AuthSessionPayload,
  invitationToken?: string,
  invitationCode?: string,
) {
  await clearPendingMfaChallenge();
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
  useAuthStore.getState().setBooting();
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
