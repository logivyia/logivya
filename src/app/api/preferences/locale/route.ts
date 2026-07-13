import { NextResponse } from "next/server";
import { z } from "zod";
import { locales } from "@/i18n/config";
import { prisma } from "@/server/db";
import { getSessionContext } from "@/server/auth/session";

const schema = z.object({ locale: z.enum(locales) });

export async function GET() {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  return NextResponse.json({ locale: context.user.locale });
}

export async function PATCH(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

  await prisma.user.update({ where: { id: context.user.id }, data: { locale: parsed.data.locale } });
  const response = NextResponse.json({ locale: parsed.data.locale });
  response.cookies.set("logivya.locale", parsed.data.locale, {
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
