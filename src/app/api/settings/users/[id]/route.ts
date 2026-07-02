import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { deleteCompanyUser, updateCompanyUser, updateCompanyUserSchema } from "@/server/team/company-users";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireApiSession();
    const parsed = updateCompanyUserSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });

    await updateCompanyUser(request, {
      companyId: company.id,
      actorUserId: user.id,
      actorRole: membership.role,
    }, id, parsed.data);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "errors.generic";
    const status = message === "NOT_FOUND" ? 404 : message === "validation.invalid" ? 400 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireApiSession();

    await deleteCompanyUser(request, {
      companyId: company.id,
      actorUserId: user.id,
      actorRole: membership.role,
    }, id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "errors.generic";
    const status = message === "NOT_FOUND" ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
