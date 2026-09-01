import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import {
  deleteCompanyUser,
  rejectCompanyUserRoleMutation,
  updateCompanyUser,
  updateCompanyUserSchema,
} from "@/server/team/company-users";

function teamError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "FORBIDDEN") return mobileError("FORBIDDEN", "Kullanici yonetimi icin yetkiniz yok.", { status: 403 });
    if (error.message === "NOT_FOUND") return mobileError("NOT_FOUND", "Kullanici bulunamadi.", { status: 404 });
    if (error.message === "SEAT_LIMIT_REACHED") {
      return mobileError("SEAT_LIMIT_REACHED", "Planınızdaki kullanılabilir hesap kapasitesi dolu.", {
        status: 409,
        details: { limit: (error as Error & { limit?: number }).limit },
      });
    }
    if (error.message === "users.lastOwner") return mobileError("FORBIDDEN", "Son aktif yonetici kullanici kaldirilamaz.", { status: 403 });
  }
  return mobileSafeError(error, "Kullanici islemi tamamlanamadi.");
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireMobileAuth(request);
    const body: unknown = await request.json();
    await rejectCompanyUserRoleMutation(request, {
      companyId: company.id,
      actorUserId: user.id,
      actorRole: membership.role,
    }, id, body);
    const parsed = updateCompanyUserSchema.safeParse(body);
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
