import { NextResponse } from "next/server";
import { z } from "zod";
import { isSmartScheduleDateError, parseSmartScheduleDateTime } from "@/lib/smart-schedule-date";
import { requireApiSession } from "@/server/auth/session";
import { createMessageDeliveryCampaign, isMessageDeliveryError } from "@/server/messages/delivery-pipeline";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

const scheduledAtSchema = z.union([z.string(), z.date()]).nullable().optional();

const schema = z.object({
  title: z.string().min(1).max(120),
  content: z.string().min(1).max(4096),
  groupIds: z.array(z.string()).default([]),
  categoryIds: z.array(z.string()).default([]),
  contactIds: z.array(z.string()).default([]),
  targets: z.array(z.object({ type: z.enum(["GROUP", "CONTACT"]), id: z.string().min(1) })).default([]),
  scheduleType: z.enum(["SEND_NOW", "SCHEDULED", "RECURRING"]).default("SEND_NOW"),
  scheduledAt: scheduledAtSchema,
  scheduledTimeZone: z.string().max(80).optional(),
  timeZone: z.string().max(80).optional(),
  recurringRule: z.object({
    frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
    interval: z.number().int().min(1).max(365).default(1),
  }).optional(),
}).superRefine((value, ctx) => {
  if (!value.groupIds.length && !value.categoryIds.length && !value.contactIds.length && !value.targets.length) {
    ctx.addIssue({ code: "custom", message: "validation.required", path: ["groupIds"] });
  }
  if (value.scheduleType === "RECURRING" && !value.recurringRule) {
    ctx.addIssue({ code: "custom", message: "validation.required", path: ["recurringRule"] });
  }
});

export async function POST(request: Request) {
  try {
    const { company, user, membership } = await requireApiSession();
    await enforceOperationRateLimit({
      scope: "message.campaign.create",
      subject: `${company.id}:${user.id}`,
      maxAttempts: 120,
      windowMs: 60_000,
      request,
    });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    const { scheduledAt: rawScheduledAt, scheduledTimeZone, timeZone, targets, ...campaignInput } = parsed.data;
    const groupIds = [...new Set([...campaignInput.groupIds, ...targets.filter((target) => target.type === "GROUP").map((target) => target.id)])];
    const contactIds = [...new Set([...campaignInput.contactIds, ...targets.filter((target) => target.type === "CONTACT").map((target) => target.id)])];
    let scheduledAt: Date | undefined;
    if (campaignInput.scheduleType === "SCHEDULED") {
      try {
        scheduledAt = parseSmartScheduleDateTime(rawScheduledAt, { timeZone: user.timezone ?? company.defaultTimezone ?? scheduledTimeZone ?? timeZone }).date;
      } catch (error) {
        if (isSmartScheduleDateError(error)) {
          return NextResponse.json({ error: error.userMessage, code: error.code }, { status: 400 });
        }
        throw error;
      }
    }

    const { campaign, correlationId } = await createMessageDeliveryCampaign(
      request,
      { companyId: company.id, userId: user.id, role: membership.role },
      { ...campaignInput, groupIds, contactIds, scheduledAt, source: "web" },
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
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 503 });
  }
}
