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
};

export type MobileUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
};

export type MobileCompany = {
  id: string;
  name: string;
};

export type AuthSessionPayload = {
  tokens: AuthTokens;
  user: MobileUser;
  company: MobileCompany;
  permissions: string[];
};
