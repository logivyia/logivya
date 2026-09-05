import { z } from "zod";

import { requireMobileAuth } from "@/server/mobile/auth";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { tryRecordSecurityEvent } from "@/server/security/events";

const actionSchema = z.enum([
  "APP_LOCK_ENABLED",
  "APP_LOCK_DISABLED",
  "APP_LOCK_PIN_CHANGED",
  "APP_LOCK_BIOMETRIC_UPDATED",
  "APP_LOCK_AUTO_LOCK_UPDATED",
  "APP_LOCK_PRIVACY_UPDATED",
  "APP_LOCK_RECOVERY_STARTED",
]);

const schema = z.object({
  action: actionSchema,
  details: z.object({
    biometricEnabled: z.boolean().optional(),
    appSwitcherPrivacyEnabled: z.boolean().optional(),
    autoLockSeconds: z.union([z.literal(0), z.literal(60), z.literal(300), z.literal(900)]).optional(),
  }).strict().optional(),
}).strict();

const eventMessages: Record<z.infer<typeof actionSchema>, string> = {
  APP_LOCK_ENABLED: "Mobile app lock was enabled on a device.",
  APP_LOCK_DISABLED: "Mobile app lock was disabled on a device.",
  APP_LOCK_PIN_CHANGED: "Mobile app lock PIN was changed on a device.",
  APP_LOCK_BIOMETRIC_UPDATED: "Mobile app lock biometric preference was changed.",
  APP_LOCK_AUTO_LOCK_UPDATED: "Mobile app lock timeout was changed.",
  APP_LOCK_PRIVACY_UPDATED: "Mobile app switcher privacy preference was changed.",
  APP_LOCK_RECOVERY_STARTED: "Mobile app lock recovery was started and reauthentication was required.",
};

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);

    await enforceOperationRateLimit({
      scope: "mobile-app-lock-security-event",
      subject: context.user.id,
      maxAttempts: 30,
      windowMs: 60 * 60_000,
      request,
    });

    await tryRecordSecurityEvent({
      request,
      companyId: context.company.id,
      userId: context.user.id,
      severity: parsed.data.action === "APP_LOCK_RECOVERY_STARTED" ? "MEDIUM" : "LOW",
      type: parsed.data.action,
      message: eventMessages[parsed.data.action],
      result: "SUCCESS",
      source: "mobile-local-app-lock",
      clientPlatform: context.platform,
      metadata: {
        ...parsed.data.details,
        deviceId: context.deviceId,
        sessionId: context.sessionId,
      },
    });

    return mobileSuccess({ accepted: true }, { status: 202 });
  } catch (error) {
    return mobileSafeError(error);
  }
}
