import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";
import { requestCurrentAccountGroupSync, resolveCurrentWhatsAppAccount } from "@/server/whatsapp/account-scope";
import { assertSameOrigin } from "@/server/whatsapp/request-guards";
import { whatsappUserMessage } from "@/server/whatsapp/user-errors";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "manage_groups");
    const scope = { companyId: company.id, userId: user.id };
    const account = await resolveCurrentWhatsAppAccount(scope);
    if (!account) {
      return NextResponse.json({ error: "WhatsApp hesabınızı bağlayın" }, { status: 409 });
    }

    const job = await requestCurrentAccountGroupSync(scope, account, "web-manual-refresh");
    const groupCount = await prisma.whatsAppGroup.count({
      where: { companyId: company.id, userId: user.id, accountId: account.id, isArchived: false },
    });
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "whatsapp.groups.sync_current.requested",
      entityType: "WhatsAppAccount",
      entityId: account.id,
      after: { jobId: job.id, groupCount },
    });

    return NextResponse.json({
      ok: true,
      message: "WhatsApp grupları yenileniyor",
      accountId: account.id,
      jobId: job.id,
      groupCount,
    });
  } catch (error) {
    return NextResponse.json({ error: whatsappUserMessage(error, "sync") }, { status: 503 });
  }
}
