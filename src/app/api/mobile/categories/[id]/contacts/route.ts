import { isCategoryTargetError, listCategoryContactAssignments } from "@/server/categories/category-targets";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, user } = await requireMobileAuth(request);
    const url = new URL(request.url);
    const result = await listCategoryContactAssignments(
      { companyId: company.id, userId: user.id },
      id,
      {
        page: Number(url.searchParams.get("page") || 1),
        limit: Number(url.searchParams.get("limit") || 50),
        search: url.searchParams.get("search") || undefined,
      },
    );
    return mobileSuccess(result);
  } catch (error) {
    if (isCategoryTargetError(error)) return mobileError(error.code, error.userMessage, { status: error.status });
    return mobileSafeError(error, "Kategori kişileri yüklenemedi.");
  }
}
