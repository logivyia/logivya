export type MobileApiSuccess<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type MobileApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type MobileApiResponse<T> = MobileApiSuccess<T> | MobileApiError;

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  expiresIn?: number;
  refreshExpiresAt?: string | Date;
  tokenType?: string;
};

export type MobileUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  locale?: string | null;
  timezone?: string | null;
  role: string;
  isAdmin?: boolean;
  isPlatformAdmin?: boolean;
};

export type MobileCompany = {
  id: string;
  name: string;
  defaultLanguage?: string | null;
  defaultTimezone?: string | null;
  defaultCurrency?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxOffice?: string | null;
  taxNumber?: string | null;
  city?: string | null;
  district?: string | null;
  country?: string | null;
  postalCode?: string | null;
};

export type AuthSessionPayload = {
  tokens: AuthTokens;
  user: MobileUser;
  company: MobileCompany;
  permissions: string[];
  isAdmin?: boolean;
  isPlatformAdmin?: boolean;
  platformAdminRole?: string | null;
  adminPermissions?: string[];
  trustedDeviceToken?: string;
  recoveryCodes?: string[];
};

export type MfaLoginChallengePayload = {
  mfaRequired: true;
  mfaSetupRequired: boolean;
  challengeToken: string;
  expiresAt: string;
  credentialId?: string;
  setupToken?: string;
  secret?: string;
  otpauthUrl?: string;
  qrCodeDataUrl?: string;
  recoveryCodes?: string[];
  availableMethods: Array<"TOTP" | "EMAIL_OTP">;
  selectedMethod?: "TOTP" | "EMAIL_OTP" | null;
  preferredMethod?: "TOTP" | "EMAIL_OTP" | null;
  emailMasked?: string;
  recoveryAvailable?: boolean;
};

export type PasswordChangeChallengePayload = {
  passwordChangeRequired: true;
  challengeToken: string;
  expiresAt: string;
};

export type LoginResponsePayload =
  | AuthSessionPayload
  | MfaLoginChallengePayload
  | PasswordChangeChallengePayload;
