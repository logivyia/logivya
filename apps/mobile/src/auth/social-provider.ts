import {
  GoogleSignin,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

import { config } from "@/constants/config";

export type MobileSocialProvider = "GOOGLE" | "APPLE";

export class SocialProviderError extends Error {
  constructor(readonly code: "NOT_CONFIGURED" | "UNAVAILABLE" | "TOKEN_MISSING") {
    super(code);
    this.name = "SocialProviderError";
  }
}

let configuredGoogleKey = "";

function configureGoogle() {
  const platformClientId = Platform.OS === "ios"
    ? config.googleIosClientId
    : config.googleAndroidClientId;
  if (!config.googleWebClientId || !platformClientId) {
    throw new SocialProviderError("NOT_CONFIGURED");
  }

  const key = `${config.googleWebClientId}:${platformClientId}`;
  if (configuredGoogleKey === key) return;
  GoogleSignin.configure({
    webClientId: config.googleWebClientId,
    offlineAccess: false,
    ...(config.googleIosClientId ? { iosClientId: config.googleIosClientId } : {}),
  });
  configuredGoogleKey = key;
}

export async function requestGoogleIdentityToken() {
  configureGoogle();
  try {
    if (Platform.OS === "android") {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;
    const identityToken = response.data.idToken || (await GoogleSignin.getTokens()).idToken;
    if (!identityToken) throw new SocialProviderError("TOKEN_MISSING");
    return { identityToken, nonce: undefined };
  } catch (error) {
    if (error instanceof SocialProviderError) throw error;
    const code = typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
    if (code === "SIGN_IN_CANCELLED" || code === "12501") return null;
    throw new SocialProviderError("UNAVAILABLE");
  }
}

export async function isAppleSignInAvailable() {
  return Platform.OS === "ios" && AppleAuthentication.isAvailableAsync();
}

export async function requestAppleIdentityToken() {
  if (!await isAppleSignInAvailable()) {
    throw new SocialProviderError("UNAVAILABLE");
  }
  try {
    const nonce = Crypto.randomUUID();
    const state = Crypto.randomUUID();
    const credential = await AppleAuthentication.signInAsync({
      nonce,
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      state,
    });
    if (credential.state !== state) throw new SocialProviderError("TOKEN_MISSING");
    if (!credential.identityToken) throw new SocialProviderError("TOKEN_MISSING");
    return { identityToken: credential.identityToken, nonce };
  } catch (error) {
    if (error instanceof SocialProviderError) throw error;
    const code = typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
    if (code === "ERR_REQUEST_CANCELED") return null;
    throw new SocialProviderError("UNAVAILABLE");
  }
}
