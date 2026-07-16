import { NextResponse } from "next/server";
import { z } from "zod";

import { revokeUserSecuritySession } from "@/server/auth/device-sessions";
import { destroySession, requireApiSession } from "@/server/auth/session";
import { writeAuditLog } from "@/server/security/audit";

const paramsSchema = z.object({
  kind: z.enum(["WEB", "MOBILE"]),
  id: z.string().min(10).max(128),
});

export async function DELETE(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const context = await requireApiSession();
    const parsed = paramsSchema.safeParse(await params);
    if (!parsed.success) return NextResponse.json({ error: "INVALID_SESSION" }, { status: 400 });
    const revoked = await revokeUserSecuritySession(context.user.id, parsed.data.kind, parsed.data.id);
    if (!revoked) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
    const currentRevoked = parsed.data.kind === "WEB" && parsed.data.id === context.session.id;
    await writeAuditLog(request, {
      companyId: context.company.id,
      userId: context.user.id,
      action: "AUTH_DEVICE_SESSION_REVOKED",
      entityType: parsed.data.kind === "WEB" ? "UserSession" : "MobileDeviceSession",
      entityId: parsed.data.id,
      after: { currentRevoked },
    });
    if (currentRevoked) await destroySession();
    return NextResponse.json({ ok: true, currentRevoked });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
