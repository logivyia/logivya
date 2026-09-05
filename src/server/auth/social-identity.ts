import { OAuth2Client } from "google-auth-library";
import { createRemoteJWKSet, jwtVerify } from "jose";

export type SocialIdentityProvider = "GOOGLE" | "APPLE";

export type VerifiedSocialIdentity = {
  provider: SocialIdentityProvider;
  subject: string;
  email: string;
  emailVerified: true;
  privateEmail: boolean;
};

export class SocialIdentityError extends Error {
  constructor(
    readonly code: "SOCIAL_LOGIN_NOT_CONFIGURED" | "SOCIAL_TOKEN_INVALID" | "SOCIAL_EMAIL_UNVERIFIED",
  ) {
    super(code);
    this.name = "SocialIdentityError";
  }
}

const googleClient = new OAuth2Client();
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

function configuredAudiences(...values: Array<string | undefined>) {
  return values
    .flatMap((value) => value?.split(",") ?? [])
    .map((value) => value.trim())
    .filter((value, index, audiences) => value.length > 0 && audiences.indexOf(value) === index);
}

export function socialIdentityAudiences(provider: SocialIdentityProvider) {
  if (provider === "GOOGLE") {
    return configuredAudiences(
      process.env.GOOGLE_WEB_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_IDS,
      process.env.GOOGLE_OAUTH_CLIENT_ID,
    );
  }

  return configuredAudiences(
    process.env.APPLE_WEB_CLIENT_ID,
    process.env.APPLE_SIGN_IN_SERVICE_ID,
    process.env.APPLE_SIGN_IN_AUDIENCES,
    process.env.APPLE_SIGN_IN_AUDIENCE,
    "com.logivya.mobile",
  );
}

export function webSocialIdentityConfiguration() {
  // Browser GIS must receive a Web application client ID. Android/iOS client
  // identifiers are valid verification audiences but cannot initialize GIS.
  const googleClientId = configuredAudiences(process.env.GOOGLE_WEB_OAUTH_CLIENT_ID)[0] ?? null;
  const appleClientId = configuredAudiences(
    process.env.APPLE_WEB_CLIENT_ID,
    process.env.APPLE_SIGN_IN_SERVICE_ID,
  )[0] ?? null;
  const appleRedirectUri = process.env.APPLE_WEB_REDIRECT_URI?.trim() || null;

  return {
    googleClientId,
    appleClientId: appleClientId && appleRedirectUri ? appleClientId : null,
    appleRedirectUri: appleClientId && appleRedirectUri ? appleRedirectUri : null,
  };
}

function normalizeVerifiedEmail(value: unknown) {
  if (typeof value !== "string") throw new SocialIdentityError("SOCIAL_EMAIL_UNVERIFIED");
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !email.includes("@")) {
    throw new SocialIdentityError("SOCIAL_EMAIL_UNVERIFIED");
  }
  return email;
}

function claimIsTrue(value: unknown) {
  return value === true || value === "true";
}

async function verifyGoogleIdentityToken(identityToken: string): Promise<VerifiedSocialIdentity> {
  const audiences = socialIdentityAudiences("GOOGLE");
  if (!audiences.length) throw new SocialIdentityError("SOCIAL_LOGIN_NOT_CONFIGURED");

  try {
    const ticket = await googleClient.verifyIdToken({ idToken: identityToken, audience: audiences });
    const payload = ticket.getPayload();
    if (!payload?.sub || !claimIsTrue(payload.email_verified)) {
      throw new SocialIdentityError("SOCIAL_EMAIL_UNVERIFIED");
    }

    const email = normalizeVerifiedEmail(payload.email);
    const emailDomain = email.split("@")[1];
    const googleControlsEmailDomain = emailDomain === "gmail.com"
      || emailDomain === "googlemail.com"
      || (typeof payload.hd === "string" && payload.hd.trim().length > 0);
    if (!googleControlsEmailDomain) {
      throw new SocialIdentityError("SOCIAL_EMAIL_UNVERIFIED");
    }

    return {
      provider: "GOOGLE",
      subject: payload.sub,
      email,
      emailVerified: true,
      privateEmail: false,
    };
  } catch (error) {
    if (error instanceof SocialIdentityError) throw error;
    throw new SocialIdentityError("SOCIAL_TOKEN_INVALID");
  }
}

async function verifyAppleIdentityToken(identityToken: string, expectedNonce?: string): Promise<VerifiedSocialIdentity> {
  const audiences = socialIdentityAudiences("APPLE");
  if (!audiences.length) throw new SocialIdentityError("SOCIAL_LOGIN_NOT_CONFIGURED");
  if (!expectedNonce) throw new SocialIdentityError("SOCIAL_TOKEN_INVALID");

  try {
    const { payload } = await jwtVerify(identityToken, appleJwks, {
      algorithms: ["RS256"],
      audience: audiences,
      issuer: "https://appleid.apple.com",
    });
    if (!payload.sub || payload.nonce !== expectedNonce || !claimIsTrue(payload.email_verified)) {
      throw new SocialIdentityError("SOCIAL_EMAIL_UNVERIFIED");
    }

    return {
      provider: "APPLE",
      subject: payload.sub,
      email: normalizeVerifiedEmail(payload.email),
      emailVerified: true,
      privateEmail: claimIsTrue(payload.is_private_email),
    };
  } catch (error) {
    if (error instanceof SocialIdentityError) throw error;
    throw new SocialIdentityError("SOCIAL_TOKEN_INVALID");
  }
}

export async function verifySocialIdentity(
  provider: SocialIdentityProvider,
  identityToken: string,
  nonce?: string,
) {
  return provider === "GOOGLE"
    ? verifyGoogleIdentityToken(identityToken)
    : verifyAppleIdentityToken(identityToken, nonce);
}
