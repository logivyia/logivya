import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/server/security/passwords";
import { requestId, safeAdminError } from "@/server/security/admin-request";

const schema = z.object({ password: z.string().min(1).max(256) });
const ADMIN_REAUTH_TTL_MS = 10 * 60_000;

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const context = await requirePlatformAdmin("admin.dashboard.read", request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "VALIDATION_ERROR", requestId: id },
        { status: 400 },
      );
    const valid = await verifyPassword(
      context.user.passwordHash,
      parsed.data.password,
      process.env.PASSWORD_PEPPER ?? "",
    );
    if (!valid) {
      await prisma.adminSessionEvent.create({
        data: {
          userId: context.user.id,
          type: "ADMIN_REAUTH_FAILED",
          requestId: id,
          ipAddress: request.headers
            .get("x-forwarded-for")
            ?.split(",")[0]
            ?.trim(),
          userAgent: request.headers.get("user-agent"),
        },
      });
      return NextResponse.json(
        { error: "INVALID_CREDENTIALS", requestId: id },
        { status: 401 },
      );
    }
    const elevatedAt = new Date();
    const expiresAt = new Date(elevatedAt.getTime() + ADMIN_REAUTH_TTL_MS);
    await prisma.$transaction([
      prisma.platformAdmin.upsert({
        where: { userId: context.user.id },
        create: {
          userId: context.user.id,
          role: context.platformAdmin.role,
          permissions: context.platformAdmin.permissions,
          isActive: true,
          requiresMfa: context.platformAdmin.requiresMfa,
          lastElevatedAt: elevatedAt,
        },
        update: { lastElevatedAt: elevatedAt },
      }),
      prisma.adminSessionEvent.create({
        data: {
          userId: context.user.id,
          type: "ADMIN_REAUTH_SUCCEEDED",
          requestId: id,
          ipAddress: request.headers
            .get("x-forwarded-for")
            ?.split(",")[0]
            ?.trim(),
          userAgent: request.headers.get("user-agent"),
        },
      }),
    ]);
    return NextResponse.json({
      ok: true,
      requestId: id,
      elevatedAt: elevatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
