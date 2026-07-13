import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { isCategoryTargetError, listCategoryContactAssignments } from "@/server/categories/category-targets";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, user } = await requireApiSession();
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
    return NextResponse.json(result);
  } catch (error) {
    if (isCategoryTargetError(error)) {
      return NextResponse.json({ error: error.code, message: error.userMessage }, { status: error.status });
    }
    return NextResponse.json({ error: "CATEGORY_ASSIGNMENT_LOAD_FAILED", message: "Kategori kişileri yüklenemedi." }, { status: 500 });
  }
}
