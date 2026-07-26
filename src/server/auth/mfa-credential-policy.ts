export const TOTP_CREDENTIAL_TYPE = "TOTP";

export function activeTotpCredentialWhere(userId: string, allowUnverified = false) {
  return {
    userId,
    type: TOTP_CREDENTIAL_TYPE,
    revokedAt: null,
    ...(allowUnverified ? {} : { verifiedAt: { not: null } }),
  };
}
