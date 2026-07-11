import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { listCompanyUsers, serializeCompanyMember } from "@/server/team/company-users";

export async function GET() {
  try {
    const { company, membership } = await requireApiSession();
    if (membership.role !== "OWNER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const members = await listCompanyUsers(company.id);
    return NextResponse.json({ members: members.map(serializeCompanyMember) });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
