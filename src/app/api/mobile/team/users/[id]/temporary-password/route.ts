import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import {
  directCompanyUserErrorStatus,
  directCompanyUserPublicErrorCode,
  resetCompanyUserTemporaryPassword,
  resetCompanyUserTemporaryPasswordSchema,
} from "@/server/team/direct-company-users";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    const parsed = resetCompanyUserTemporaryPasswordSchema.safeParse(await request.json());
    if (!parsed.success) return mobileError("PASSWORD_REQUIRED", "Temporary password is required.", { status: 400 });
    await resetCompanyUserTemporaryPassword(request, {
      companyId: company.id,
      actorUserId: user.id,
      actorRole: membership.role,
    }, (await params).id, parsed.data.temporaryPassword);
    return mobileSuccess({ success: true as const });
  } catch (error) {
    const code = directCompanyUserPublicErrorCode(error);
    if (code === "USER_OPERATION_FAILED") return mobileSafeError(error, "User operation could not be completed.");
    return mobileError(code, "User operation could not be completed.", { status: directCompanyUserErrorStatus(code) });
  }
}
