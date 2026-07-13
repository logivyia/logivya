import { z } from "zod";
import { locales } from "@/i18n/config";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";

const schema = z.object({ locale: z.enum(locales) });

export async function GET(request: Request) {
  try {
    const { user } = await requireMobileAuth(request);
    return mobileSuccess({ locale: user.locale });
  } catch (error) {
    return mobileSafeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { user } = await requireMobileAuth(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return mobileValidationError(parsed.error);
    await prisma.user.update({ where: { id: user.id }, data: { locale: parsed.data.locale } });
    return mobileSuccess({ locale: parsed.data.locale });
  } catch (error) {
    return mobileSafeError(error);
  }
}
