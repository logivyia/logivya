import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import {
  inviteCompanyUser,
  inviteCompanyUserSchema,
  listCompanyUsers,
  serializeCompanyMember,
} from "@/server/team/company-users";

export async function GET() {
  try {
    const { company, membership } = await requireApiSession();
    if (!["OWNER", "ADMIN"].includes(membership.role)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const users = await listCompanyUsers(company.id);
    return NextResponse.json({ users: users.map(serializeCompanyMember) });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { company, membership, user: actor } = await requireApiSession();
    const parsed = inviteCompanyUserSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });

    const member = await inviteCompanyUser(request, {
      companyId: company.id,
      actorUserId: actor.id,
      actorRole: membership.role,
    }, parsed.data);

    return NextResponse.json({ member: serializeCompanyMember(member) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "errors.generic";
    const status = message === "users.planLimit" || message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: message, limit: (error as { limit?: number } | null)?.limit }, { status });
  }
}
