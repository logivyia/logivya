import { z } from "zod";

import { prisma } from "@/server/db";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { requireTelegramInternalAccess } from "@/server/telegram/access";
import { telegramSafeError } from "@/server/telegram/response";

const schema = z.object({ chatIds: z.array(z.string().cuid()).max(1000) });

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, company } = await requireTelegramInternalAccess(request);
    const { id: categoryId } = await context.params;
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    const category = await prisma.category.findFirst({ where: { id: categoryId, companyId: company.id, archivedAt: null }, select: { id: true } });
    if (!category) throw new Error("TELEGRAM_NOT_FOUND");
    const chatIds = [...new Set(parsed.data.chatIds)];
    const chats = await prisma.telegramChat.findMany({
      where: { id: { in: chatIds }, companyId: company.id, isActive: true, account: { ownerUserId: user.id, archivedAt: null } },
      select: { id: true },
    });
    if (chats.length !== chatIds.length) throw new Error("TELEGRAM_VALIDATION_TARGETS");
    await prisma.$transaction([
      prisma.telegramCategoryChat.deleteMany({ where: { categoryId, companyId: company.id, chat: { account: { ownerUserId: user.id } } } }),
      ...(chats.length ? [prisma.telegramCategoryChat.createMany({ data: chats.map((chat) => ({ categoryId, chatId: chat.id, companyId: company.id })) })] : []),
    ]);
    return mobileSuccess({ categoryId, chatIds });
  } catch (error) {
    return telegramSafeError(error);
  }
}
