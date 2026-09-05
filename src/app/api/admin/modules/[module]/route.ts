import { NextResponse } from "next/server";

import {
  getAdminModuleSnapshot,
  isAdminSnapshotModule,
  parseAdminSnapshotQuery,
} from "@/server/admin/module-snapshots";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import type { AdminPermission } from "@/server/auth/admin-permissions";

export const dynamic = "force-dynamic";

const MODULE_READ_PERMISSIONS = {
  billing: "admin.billing.read",
  "whatsapp-accounts": "admin.whatsapp.read",
  campaigns: "admin.campaignMetrics.read",
  compliance: "admin.audit.read",
  audit: "admin.audit.read",
  notifications: "admin.notifications.read",
  "data-requests": "admin.privacy.read",
  backups: "admin.backups.read",
  "disaster-recovery": "admin.backups.read",
  releases: "admin.releases.read",
  settings: "admin.settings.read",
  "feature-flags": "admin.settings.read",
  announcements: "admin.notifications.read",
  "api-usage": "admin.apiUsage.read",
  webhooks: "admin.settings.read",
  "platform-settings": "admin.settings.read",
} satisfies Record<string, AdminPermission>;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ module: string }> },
) {
  const id = requestId(request);
  try {
    const { module } = await params;
    if (!isAdminSnapshotModule(module)) {
      return NextResponse.json(
        { error: "ADMIN_MODULE_NOT_FOUND", requestId: id },
        { status: 404 },
      );
    }
    await requirePlatformAdmin(MODULE_READ_PERMISSIONS[module], request);
    const snapshot = await getAdminModuleSnapshot(
      module,
      parseAdminSnapshotQuery(request),
    );
    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Request-Id": id,
      },
    });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return NextResponse.json(safe.body, {
      status: safe.status,
      headers: { "X-Request-Id": id },
    });
  }
}
