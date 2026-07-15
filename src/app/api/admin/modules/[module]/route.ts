import { NextResponse } from "next/server";

import { getAdminModuleSnapshot, isAdminSnapshotModule, parseAdminSnapshotQuery } from "@/server/admin/module-snapshots";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { requestId, safeAdminError } from "@/server/security/admin-request";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ module: string }> }) {
  const id = requestId(request);
  try {
    await requirePlatformAdmin("admin.dashboard.read", request);
    const { module } = await params;
    if (!isAdminSnapshotModule(module)) {
      return NextResponse.json({ error: "ADMIN_MODULE_NOT_FOUND", requestId: id }, { status: 404 });
    }
    const snapshot = await getAdminModuleSnapshot(module, parseAdminSnapshotQuery(request));
    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Request-Id": id,
      },
    });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return NextResponse.json(safe.body, { status: safe.status, headers: { "X-Request-Id": id } });
  }
}
