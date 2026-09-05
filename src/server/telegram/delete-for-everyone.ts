import { prisma } from "@/server/db";
import { deleteTelegramMessagesForEveryone } from "@/server/telegram/tdlib-client";
import { decodeTelegramExternalMessageIds } from "@/server/telegram/message-ids";

type DeleteCandidate = {
  id: string;
  externalMessageIds: string[];
  externalChatId: string;
};

function deleteErrorCode(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  return value.trim().slice(0, 120) || "TELEGRAM_DELETE_FAILED";
}

async function waitForInFlightDeliveries(dispatchId: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const processing = await prisma.telegramDelivery.count({
      where: { run: { dispatchId }, status: "PROCESSING" },
    });
    if (processing === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("TELEGRAM_DELETE_BUSY");
}

async function persistDeleteFailures(
  failures: Array<{ deliveryId: string; code: string }>,
) {
  const byCode = new Map<string, string[]>();
  for (const failure of failures) {
    const deliveryIds = byCode.get(failure.code) ?? [];
    deliveryIds.push(failure.deliveryId);
    byCode.set(failure.code, deliveryIds);
  }
  for (const [code, deliveryIds] of byCode) {
    await prisma.telegramDelivery.updateMany({
      where: { id: { in: deliveryIds } },
      data: { deleteStatus: "FAILED", deleteErrorCode: code },
    });
  }
}

export async function deleteOwnedTelegramDispatchForEveryone(input: {
  dispatchId: string;
  companyId: string;
  userId: string;
}) {
  const dispatch = await prisma.telegramDispatch.findFirst({
    where: {
      id: input.dispatchId,
      companyId: input.companyId,
      createdById: input.userId,
    },
    select: {
      id: true,
      accountId: true,
      deleteRequestedAt: true,
      deletedForEveryoneAt: true,
    },
  });
  if (!dispatch) throw new Error("TELEGRAM_NOT_FOUND");

  const requestedAt = dispatch.deleteRequestedAt ?? new Date();
  await prisma.$transaction([
    prisma.telegramDispatch.updateMany({
      where: { id: dispatch.id, status: "ACTIVE" },
      data: { status: "CANCELED", deleteRequestedAt: requestedAt },
    }),
    prisma.telegramDelivery.updateMany({
      where: {
        run: { dispatchId: dispatch.id },
        status: { in: ["QUEUED", "FLOOD_WAIT"] },
      },
      data: { status: "CANCELED", lockedAt: null, lockedBy: null },
    }),
    prisma.telegramDispatchRun.updateMany({
      where: { dispatchId: dispatch.id, status: "QUEUED" },
      data: { status: "CANCELED", completedAt: new Date() },
    }),
  ]);

  await waitForInFlightDeliveries(dispatch.id);

  const sentDeliveries = await prisma.telegramDelivery.findMany({
    where: {
      run: { dispatchId: dispatch.id },
      status: "SENT",
      externalMessageId: { not: null },
    },
    select: {
      id: true,
      externalMessageId: true,
      deleteStatus: true,
      chat: { select: { externalChatId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (sentDeliveries.length === 0) throw new Error("TELEGRAM_DELETE_UNAVAILABLE");
  const alreadyDeleted = sentDeliveries.filter(
    (delivery) => delivery.deleteStatus === "DELETED",
  ).length;

  const candidates: DeleteCandidate[] = sentDeliveries
    .filter((delivery) => delivery.deleteStatus !== "DELETED" && delivery.externalMessageId)
    .map((delivery) => ({
      id: delivery.id,
      externalMessageIds: decodeTelegramExternalMessageIds(delivery.externalMessageId),
      externalChatId: delivery.chat.externalChatId,
    }))
    .filter((delivery) => delivery.externalMessageIds.length > 0);

  if (candidates.length > 0) {
    await prisma.telegramDelivery.updateMany({
      where: { id: { in: candidates.map((candidate) => candidate.id) } },
      data: {
        deleteStatus: "PENDING",
        deleteRequestedAt: requestedAt,
        deleteErrorCode: null,
      },
    });

    const byChat = new Map<string, DeleteCandidate[]>();
    for (const candidate of candidates) {
      const items = byChat.get(candidate.externalChatId) ?? [];
      items.push(candidate);
      byChat.set(candidate.externalChatId, items);
    }

    const groups = [...byChat.entries()];
    for (let index = 0; index < groups.length; index += 8) {
      await Promise.all(
        groups.slice(index, index + 8).map(async ([externalChatId, items]) => {
          try {
            const result = await deleteTelegramMessagesForEveryone(
              dispatch.accountId,
              externalChatId,
              items.flatMap((item) => item.externalMessageIds),
            );
            const deletedMessageIds = new Set(result.deletedMessageIds);
            const failuresByMessageId = new Map(result.failed.map((failure) => [failure.messageId, failure.code]));
            const deletedIds = items
              .filter((item) => item.externalMessageIds.every((messageId) => deletedMessageIds.has(messageId)))
              .map((item) => item.id);
            if (deletedIds.length > 0) {
              await prisma.telegramDelivery.updateMany({
                where: { id: { in: deletedIds } },
                data: {
                  deleteStatus: "DELETED",
                  deletedForEveryoneAt: new Date(),
                  deleteErrorCode: null,
                },
              });
            }
            await persistDeleteFailures(
              items
                .filter((item) => !deletedIds.includes(item.id))
                .map((item) => ({
                  deliveryId: item.id,
                  code: item.externalMessageIds.map((messageId) => failuresByMessageId.get(messageId)).find(Boolean) || "TELEGRAM_DELETE_PARTIAL",
                })),
            );
          } catch (error) {
            const code = deleteErrorCode(error);
            await persistDeleteFailures(
              items.map((item) => ({ deliveryId: item.id, code })),
            );
          }
        }),
      );
    }
  }

  const counts = await prisma.telegramDelivery.groupBy({
    by: ["deleteStatus"],
    where: {
      run: { dispatchId: dispatch.id },
      status: "SENT",
      externalMessageId: { not: null },
    },
    _count: { _all: true },
  });
  const countFor = (status: "PENDING" | "DELETED" | "FAILED") =>
    counts.find((item) => item.deleteStatus === status)?._count._all ?? 0;
  const total = counts.reduce((sum, item) => sum + item._count._all, 0);
  const deleted = countFor("DELETED");
  const failed = countFor("FAILED");
  const pending = countFor("PENDING");
  const completedAt = total > 0 && deleted === total
    ? dispatch.deletedForEveryoneAt ?? new Date()
    : null;

  await prisma.telegramDispatch.update({
    where: { id: dispatch.id },
    data: {
      deleteRequestedAt: requestedAt,
      deletedForEveryoneAt: completedAt,
      deleteTotalCount: total,
      deleteSuccessCount: deleted,
      deleteFailedCount: failed,
    },
  });

  return {
    requestedAt,
    completedAt,
    total,
    deleted,
    failed,
    pending,
    alreadyDeleted,
    canRetry: failed > 0 || pending > 0,
  };
}
