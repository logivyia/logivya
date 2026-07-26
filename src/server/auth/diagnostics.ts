import { createHash } from "node:crypto";

import { logger } from "@/server/observability/logger";
import { requestLogContext } from "@/server/observability/request-id";

export type AuthenticationStage =
  | "REQUEST_RECEIVED"
  | "CREDENTIAL_VERIFICATION"
  | "CHALLENGE_CREATION"
  | "CHALLENGE_LOOKUP"
  | "TOTP_SECRET_DECRYPTION"
  | "TOTP_VERIFICATION"
  | "CHALLENGE_CONSUMPTION"
  | "SESSION_CREATION"
  | "TOKEN_OR_COOKIE_DELIVERY"
  | "PROFILE_BOOTSTRAP";

export type SafeAuthenticationErrorCode =
  | "MFA_CODE_INVALID"
  | "MFA_CODE_REUSED"
  | "MFA_CHALLENGE_EXPIRED"
  | "MFA_RATE_LIMITED"
  | "MFA_CONFIGURATION_ERROR"
  | "AUTH_SESSION_CREATE_FAILED"
  | "AUTH_INTERNAL_ERROR";

const safeCodeByInternalCode: Record<string, SafeAuthenticationErrorCode> = {
  INVALID_TOTP_CODE: "MFA_CODE_INVALID",
  MFA_INVALID: "MFA_CODE_INVALID",
  MFA_CODE_INVALID: "MFA_CODE_INVALID",
  MFA_CODE_REUSED: "MFA_CODE_REUSED",
  MFA_CHALLENGE_INVALID: "MFA_CHALLENGE_EXPIRED",
  MFA_CHALLENGE_EXPIRED: "MFA_CHALLENGE_EXPIRED",
  MFA_CHALLENGE_LOCKED: "MFA_RATE_LIMITED",
  RATE_LIMITED: "MFA_RATE_LIMITED",
  MFA_ENCRYPTION_NOT_CONFIGURED: "MFA_CONFIGURATION_ERROR",
  MFA_SECRET_INVALID: "MFA_CONFIGURATION_ERROR",
  MFA_SECRET_DECRYPTION_FAILED: "MFA_CONFIGURATION_ERROR",
  AUTH_SESSION_CREATE_FAILED: "AUTH_SESSION_CREATE_FAILED",
};

const statusBySafeCode: Record<SafeAuthenticationErrorCode, number> = {
  MFA_CODE_INVALID: 401,
  MFA_CODE_REUSED: 409,
  MFA_CHALLENGE_EXPIRED: 401,
  MFA_RATE_LIMITED: 429,
  MFA_CONFIGURATION_ERROR: 503,
  AUTH_SESSION_CREATE_FAILED: 503,
  AUTH_INTERNAL_ERROR: 500,
};

export function opaqueAuthenticationRef(value: string | null | undefined) {
  if (!value) return undefined;
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function safeAuthenticationFailure(error: unknown, stage?: AuthenticationStage) {
  const internalCode = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const code = safeCodeByInternalCode[internalCode]
    ?? (stage === "SESSION_CREATION" ? "AUTH_SESSION_CREATE_FAILED" : "AUTH_INTERNAL_ERROR");
  return {
    code,
    status: statusBySafeCode[code],
    exceptionType: error instanceof Error ? error.name : typeof error,
  };
}

export function authenticationResponseHeaders(correlationId: string) {
  return {
    "Cache-Control": "no-store, private",
    Pragma: "no-cache",
    "X-Correlation-Id": correlationId,
  };
}

export function authenticationDiagnostics(request: Request, platformOverride?: string | null, appVersionOverride?: string | null) {
  const startedAt = Date.now();
  const requestContext = requestLogContext(request);
  const platform = platformOverride || requestContext.platform || "web";
  const appVersion = appVersionOverride || requestContext.appVersion || "unknown";
  const backendVersion = process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.RENDER_GIT_COMMIT
    || process.env.GIT_COMMIT
    || "unknown";

  function context(input: {
    stage: AuthenticationStage;
    result: "STARTED" | "SUCCEEDED" | "REJECTED" | "FAILED";
    statusCode?: number;
    errorCode?: string;
    userId?: string | null;
    challengeId?: string | null;
    exceptionType?: string;
  }) {
    return {
      ...requestContext,
      platform,
      appVersion,
      backendVersion,
      authenticationStage: input.stage,
      result: input.result,
      statusCode: input.statusCode,
      errorCode: input.errorCode,
      userRef: opaqueAuthenticationRef(input.userId),
      challengeRef: opaqueAuthenticationRef(input.challengeId),
      exceptionType: input.exceptionType,
      durationMs: Date.now() - startedAt,
    };
  }

  return {
    correlationId: requestContext.correlationId,
    started(stage: AuthenticationStage, refs: { userId?: string | null; challengeId?: string | null } = {}) {
      logger.info("auth.stage_started", context({ stage, result: "STARTED", ...refs }));
    },
    succeeded(stage: AuthenticationStage, refs: { userId?: string | null; challengeId?: string | null; statusCode?: number } = {}) {
      logger.info("auth.stage_succeeded", context({ stage, result: "SUCCEEDED", ...refs }));
    },
    rejected(stage: AuthenticationStage, code: string, statusCode: number, refs: { userId?: string | null; challengeId?: string | null } = {}) {
      logger.warn("auth.stage_rejected", context({ stage, result: "REJECTED", errorCode: code, statusCode, ...refs }));
    },
    failed(stage: AuthenticationStage, error: unknown, refs: { userId?: string | null; challengeId?: string | null } = {}) {
      const failure = safeAuthenticationFailure(error, stage);
      logger.error(
        "auth.stage_failed",
        undefined,
        context({
          stage,
          result: "FAILED",
          errorCode: failure.code,
          statusCode: failure.status,
          exceptionType: failure.exceptionType,
          ...refs,
        }),
      );
      return failure;
    },
  };
}
