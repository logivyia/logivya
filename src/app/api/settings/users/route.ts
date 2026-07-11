import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import {
  listCompanyUsers,
  serializeCompanyMember,
} from "@/server/team/company-users";
import {
  createCompanyInvitation,
  companyInvitationErrorStatus,
  createCompanyInvitationSchema,
  getCompanySeatUsage,
  listCompanyInvitations,
  serializeCompanyInvitation,
} from "@/server/team/company-invitations";

export async function GET() {
  try {
    const { company, membership } = await requireApiSession();
    if (membership.role !== "OWNER") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const [users, invitations, seatUsage] = await Promise.all([
      listCompanyUsers(company.id),
      listCompanyInvitations(company.id),
      getCompanySeatUsage(company.id),
    ]);
    return NextResponse.json({
      users: users.map(serializeCompanyMember),
      invitations: invitations.map(serializeCompanyInvitation),
      seatUsage,
    });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { company, membership, user: actor } = await requireApiSession();
    const parsed = createCompanyInvitationSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });

    const result = await createCompanyInvitation(request, {
      companyId: company.id,
      actorUserId: actor.id,
      actorRole: membership.role,
    }, parsed.data);

    return NextResponse.json({
      invitation: serializeCompanyInvitation(result.invitation),
      acceptUrl: result.acceptUrl,
      inviteCode: result.inviteCode,
      emailSent: result.emailSent,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "errors.generic";
    const status = companyInvitationErrorStatus(message);
    return NextResponse.json({ error: message, limit: (error as { limit?: number } | null)?.limit }, { status });
  }
}
