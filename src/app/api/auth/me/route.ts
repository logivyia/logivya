import { NextResponse } from "next/server";
import { getSessionContext } from "@/server/auth/session";

export async function GET() {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({
    authenticated: true,
    user: { id: context.user.id, name: context.user.name, email: context.user.email, username: context.user.username },
    company: { id: context.company.id, name: context.company.name },
    role: context.membership.role,
  });
}
