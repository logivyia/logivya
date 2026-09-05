import "server-only";

import { prisma } from "@/server/db";
import { getEffectiveMessagingPlan } from "@/server/billing/effective-messaging-plan";
import { hasPermission, type WorkspaceRole } from "@/server/auth/permissions";

type SendEntitlements = {
  messageSend: boolean;
  groupMessaging: boolean;
  contactMessaging: boolean;
  scheduledMessages: boolean;
  recurringMessages: boolean;
};

export function assertTelegramSendPolicy(input: {
  role: WorkspaceRole | null;
  plan: { valid: boolean; entitlements: SendEntitlements } | null;
  scheduleType: string;
  chatTypes: string[];
}) {
  const permission = input.scheduleType === "SEND_NOW" ? "send_messages" : "schedule_messages";
  if (!input.role || !hasPermission(input.role, permission)) throw new Error("TELEGRAM_SEND_FORBIDDEN");
  const plan = input.plan;
  if (!plan?.valid || !plan.entitlements.messageSend) throw new Error("TELEGRAM_SUBSCRIPTION_LOCKED");
  const features = plan.entitlements;
  if (input.scheduleType === "SCHEDULED" && !features.scheduledMessages) throw new Error("TELEGRAM_PLAN_FORBIDDEN");
  if (input.scheduleType === "RECURRING" && !features.recurringMessages) throw new Error("TELEGRAM_PLAN_FORBIDDEN");
  for (const type of input.chatTypes) {
    if (["PRIVATE", "SECRET"].includes(type)) {
      if (!features.contactMessaging) throw new Error("TELEGRAM_PLAN_FORBIDDEN");
    } else if (["BASIC_GROUP", "SUPERGROUP", "CHANNEL"].includes(type)) {
      if (!features.groupMessaging) throw new Error("TELEGRAM_PLAN_FORBIDDEN");
    } else throw new Error("TELEGRAM_VALIDATION_TARGETS");
  }
}

export async function assertTelegramSendAccess(input: {
  userId: string; companyId: string; scheduleType: string; chatTypes: string[];
}) {
  const [membership, plan] = await Promise.all([
    prisma.companyUser.findFirst({
      where: { companyId: input.companyId, userId: input.userId, status: "ACTIVE", user: { status: "ACTIVE" } },
      select: { role: true },
    }),
    getEffectiveMessagingPlan(input.companyId),
  ]);
  assertTelegramSendPolicy({ ...input, role: membership?.role ?? null, plan });
}
