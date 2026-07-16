import { NextResponse } from "next/server";

import { destroySession, requireApiSession } from "@/server/auth/session";
import { listUserSecuritySessions, revokeAllUserSecuritySessions } from "@/server/auth/device-sessions";
import { writeAuditLog } from "@/server/security/audit";

export async function GET() {
  try {
    const context = await requireApiSession();
    const sessions = await listUserSecuritySessions(context.user.id, { webSessionId: context.session.id });
    return NextResponse.json({ sessions });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireApiSession();
    const revoked = await revokeAllUserSecuritySessions(context.user.id);
    await writeAuditLog(request, {
      companyId: context.company.id,
      userId: context.user.id,
      action: "AUTH_LOGOUT_EVERYWHERE",
      entityType: "UserSession",
      entityId: context.session.id,
      after: revoked,
    });
    await destroySession();
    return NextResponse.json({ ok: true, revoked });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
