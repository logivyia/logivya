import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { listCompanyUsers, serializeCompanyMember } from "@/server/team/company-users";

export async function GET() {
  try {
    const { company, membership, user } = await requireApiSession();
    if (membership.role !== "OWNER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const members = await listCompanyUsers(company.id);
    return NextResponse.json({ members: members.map((member) => serializeCompanyMember(member, user.id)) });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
