import {
  completeTemporaryPasswordChange,
  completeTemporaryPasswordChangeSchema,
  temporaryPasswordErrorStatus,
  temporaryPasswordPublicErrorCode,
} from "@/server/auth/temporary-password";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";

export async function POST(request: Request) {
  try {
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = completeTemporaryPasswordChangeSchema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    await completeTemporaryPasswordChange(request, parsed.data);
    return mobileSuccess({ success: true as const });
  } catch (error) {
    const code = temporaryPasswordPublicErrorCode(error);
    if (code === "PASSWORD_CHANGE_FAILED") return mobileSafeError(error, "Password could not be changed.");
    return mobileError(code, "Password could not be changed.", { status: temporaryPasswordErrorStatus(code) });
  }
}
