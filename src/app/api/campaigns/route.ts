import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/server/auth/session";
import { createMessageDeliveryCampaign, isMessageDeliveryError } from "@/server/messages/delivery-pipeline";

const schema = z.object({
  title: z.string().min(1).max(120),
  content: z.string().min(1).max(4096),
  groupIds: z.array(z.string()).default([]),
  categoryIds: z.array(z.string()).default([]),
  scheduleType: z.enum(["SEND_NOW", "SCHEDULED", "RECURRING"]).default("SEND_NOW"),
  scheduledAt: z.coerce.date().optional(),
  recurringRule: z.object({
    frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
    interval: z.number().int().min(1).max(365).default(1),
  }).optional(),
}).superRefine((value, ctx) => {
  if (!value.groupIds.length && !value.categoryIds.length) {
    ctx.addIssue({ code: "custom", message: "validation.required", path: ["groupIds"] });
  }
  if (value.scheduleType === "SCHEDULED" && !value.scheduledAt) {
    ctx.addIssue({ code: "custom", message: "validation.required", path: ["scheduledAt"] });
  }
  if (value.scheduleType === "RECURRING" && !value.recurringRule) {
    ctx.addIssue({ code: "custom", message: "validation.required", path: ["recurringRule"] });
  }
});

export async function POST(request: Request) {
  try {
    const { company, user, membership } = await requireApiSession();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });

    const { campaign, correlationId } = await createMessageDeliveryCampaign(
      request,
      { companyId: company.id, userId: user.id, role: membership.role },
      { ...parsed.data, source: "web" },
    );

    return NextResponse.json({ campaign, correlationId }, { status: 201 });
  } catch (error) {
    if (isMessageDeliveryError(error)) {
      return NextResponse.json(
        { error: error.userMessage, code: error.code, details: error.details ?? null, correlationId: error.correlationId },
        { status: error.status },
      );
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 503 });
  }
}
