import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["archive", "delete"]),
});

export async function POST(request: Request) {
  try {
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "delete_campaigns");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });

    const where = { id: { in: parsed.data.ids }, companyId: company.id, createdById: user.id };
    const deletedAt = new Date();
    const data = parsed.data.action === "delete"
      ? { deletedAt, platformDeletedAt: deletedAt, status: "DELETED" as const }
      : { status: "CANCELED" as const };
    const result = await prisma.messageCampaign.updateMany({ where, data });
    if (parsed.data.action === "delete" && result.count) {
      await prisma.messageRecipient.updateMany({
        where: { campaignId: { in: parsed.data.ids }, campaign: { companyId: company.id, createdById: user.id } },
        data: { platformDeletedAt: deletedAt },
      });
    }
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: parsed.data.action === "delete" ? "campaign.bulk_deleted" : "campaign.bulk_archived",
      entityType: "MessageCampaign",
      after: { requested: parsed.data.ids.length, affected: result.count },
    });
    return NextResponse.json({ ok: true, affected: result.count });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 403 });
  }
}
