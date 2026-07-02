import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { deleteCompanyUser, updateCompanyUser, updateCompanyUserSchema } from "@/server/team/company-users";

function teamError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "FORBIDDEN") return mobileError("FORBIDDEN", "Kullanici yonetimi icin yetkiniz yok.", { status: 403 });
    if (error.message === "NOT_FOUND") return mobileError("NOT_FOUND", "Kullanici bulunamadi.", { status: 404 });
    if (error.message === "users.lastOwner") return mobileError("FORBIDDEN", "Son aktif yonetici kullanici kaldirilamaz.", { status: 403 });
  }
  return mobileSafeError(error, "Kullanici islemi tamamlanamadi.");
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireMobileAuth(request);
    const parsed = updateCompanyUserSchema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);

    await updateCompanyUser(request, {
      companyId: company.id,
      actorUserId: user.id,
      actorRole: membership.role,
    }, id, parsed.data);

    return mobileSuccess({ success: true });
  } catch (error) {
    return teamError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireMobileAuth(request);

    await deleteCompanyUser(request, {
      companyId: company.id,
      actorUserId: user.id,
      actorRole: membership.role,
    }, id);

    return mobileSuccess({ success: true });
  } catch (error) {
    return teamError(error);
  }
}
