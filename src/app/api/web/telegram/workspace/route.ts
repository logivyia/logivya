import { NextResponse } from "next/server";

import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { writeAuditLog } from "@/server/security/audit";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { listOwnedTelegramAccounts } from "@/server/telegram/accounts";
import { createTelegramDispatch, createTelegramDispatchSchema, listTelegramHistory } from "@/server/telegram/dispatch";
import { requireWebTelegramAccess } from "@/server/web/communication-access";
import { webCommunicationSafeError, webCommunicationValidationError } from "@/server/web/communication-response";

export const dynamic = "force-dynamic";

function boundedTake(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(50, Math.trunc(parsed))) : fallback;
}

export async function GET(request: Request) {
  try {
    const { user, company } = await requireWebTelegramAccess();
    const query = new URL(request.url).searchParams;
    const requestedAccountId = query.get("accountId")?.trim() || null;
    const accounts = await listOwnedTelegramAccounts(user.id, company.id);
    const selectedAccount = requestedAccountId
      ? accounts.find((account) => account.id === requestedAccountId)
      : accounts.find((account) => account.status === "CONNECTED" && account.authState === "READY") ?? accounts[0];
    if (requestedAccountId && !selectedAccount) throw new Error("TELEGRAM_ACCOUNT_NOT_FOUND");

    const [chats, history] = await Promise.all([
      selectedAccount
        ? prisma.telegramChat.findMany({
            where: {
              companyId: company.id,
              accountId: selectedAccount.id,
              isActive: true,
              account: { ownerUserId: user.id, archivedAt: null },
            },
            select: {
              id: true,
              accountId: true,
              title: true,
              username: true,
              type: true,
              participantCount: true,
              canSend: true,
              isArchived: true,
        freightPublicationEnabled: true,
              lastSyncedAt: true,
              categoryAssignments: { select: { category: { select: { id: true, name: true, color: true } } } },
            },
            orderBy: [{ canSend: "desc" }, { title: "asc" }],
            take: 1_000,
          })
        : Promise.resolve([]),
      listTelegramHistory({
        companyId: company.id,
        userId: user.id,
        take: boundedTake(query.get("take"), 25),
      }),
    ]);

    return NextResponse.json({
      ok: true,
      accounts,
      selectedAccountId: selectedAccount?.id ?? null,
      chats,
      history,
    });
  } catch (error) {
    return webCommunicationSafeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, company } = await requireWebTelegramAccess();
    await enforceOperationRateLimit({
      scope: "telegram.web.dispatch",
      subject: `${company.id}:${user.id}`,
      maxAttempts: 30,
      windowMs: 60_000,
      request,
    });
    const parsed = createTelegramDispatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return webCommunicationValidationError(parsed.error.issues);

    const result = await createTelegramDispatch({
      companyId: company.id,
      userId: user.id,
      timezone: company.defaultTimezone,
      data: parsed.data,
    });
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "telegram.dispatch.created",
      entityType: "TelegramDispatch",
      entityId: result.dispatch.id,
      after: {
        source: "WEB",
        scheduleType: result.dispatch.scheduleType,
        targetCount: result.dispatch.targets.length,
        duplicate: result.duplicate,
      },
    }).catch((auditError) => logger.error("telegram.web_dispatch_audit_failed", auditError, { dispatchId: result.dispatch.id }));

    return NextResponse.json({ ok: true, ...result }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return webCommunicationSafeError(error);
  }
}
