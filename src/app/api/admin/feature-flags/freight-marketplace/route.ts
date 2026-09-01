import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { FREIGHT_INTERNAL_FLAG, FREIGHT_PUBLIC_FLAG } from "@/server/freight/constants";
import { writeAuditLog } from "@/server/security/audit";
import { requestId, safeAdminError } from "@/server/security/admin-request";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  publicEnabled: z.boolean().optional(),
  publicRolloutPercentage: z.number().int().min(0).max(100).optional(),
  internalEnabled: z.boolean().optional(),
  internalRolloutPercentage: z.number().int().min(0).max(100).optional(),
  confirmation: z.string().optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== "confirmation"), {
  message: "FREIGHT_FEATURE_FLAG_UPDATE_EMPTY",
});

async function snapshot() {
  const flags = await prisma.featureFlag.findMany({
    where: { key: { in: [FREIGHT_PUBLIC_FLAG, FREIGHT_INTERNAL_FLAG] } },
    select: { key: true, isEnabled: true, rolloutPercentage: true, updatedAt: true },
  });
  const byKey = new Map(flags.map((flag) => [flag.key, flag]));
  return {
    public: byKey.get(FREIGHT_PUBLIC_FLAG) ?? null,
    internal: byKey.get(FREIGHT_INTERNAL_FLAG) ?? null,
  };
}

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await requirePlatformAdmin("admin.settings.read", request);
    return NextResponse.json(await snapshot(), {
      headers: { "Cache-Control": "private, no-store", "X-Request-Id": id },
    });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return NextResponse.json(safe.body, { status: safe.status, headers: { "X-Request-Id": id } });
  }
}

export async function PATCH(request: Request) {
  const id = requestId(request);
  try {
    const admin = await requirePlatformAdmin("admin.featureFlags.update", request);
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "FREIGHT_FEATURE_FLAG_INVALID", issues: parsed.error.issues, requestId: id }, { status: 400 });
    }

    const before = await snapshot();
    if (
      parsed.data.publicEnabled === true
      && before.public?.isEnabled !== true
      && parsed.data.confirmation !== "ENABLE_FREIGHT_MARKETPLACE_PUBLIC"
    ) {
      return NextResponse.json({ error: "FREIGHT_PUBLIC_ENABLE_CONFIRMATION_REQUIRED", requestId: id }, { status: 409 });
    }

    await prisma.$transaction([
      prisma.featureFlag.upsert({
        where: { key: FREIGHT_PUBLIC_FLAG },
        create: {
          key: FREIGHT_PUBLIC_FLAG,
          name: "Freight Marketplace - Public",
          description: "Ordinary production user access. Explicit enablement is required.",
          isEnabled: parsed.data.publicEnabled ?? false,
          rolloutPercentage: parsed.data.publicRolloutPercentage ?? 0,
        },
        update: {
          ...(parsed.data.publicEnabled !== undefined ? { isEnabled: parsed.data.publicEnabled } : {}),
          ...(parsed.data.publicRolloutPercentage !== undefined ? { rolloutPercentage: parsed.data.publicRolloutPercentage } : {}),
        },
      }),
      prisma.featureFlag.upsert({
        where: { key: FREIGHT_INTERNAL_FLAG },
        create: {
          key: FREIGHT_INTERNAL_FLAG,
          name: "Freight Marketplace - Internal",
          description: "Active PlatformAdmin accounts with freight permission may test the module.",
          isEnabled: parsed.data.internalEnabled ?? true,
          rolloutPercentage: parsed.data.internalRolloutPercentage ?? 100,
        },
        update: {
          ...(parsed.data.internalEnabled !== undefined ? { isEnabled: parsed.data.internalEnabled } : {}),
          ...(parsed.data.internalRolloutPercentage !== undefined ? { rolloutPercentage: parsed.data.internalRolloutPercentage } : {}),
        },
      }),
    ]);

    const after = await snapshot();
    await writeAuditLog(request, {
      companyId: admin.company.id,
      userId: admin.user.id,
      actorType: "PLATFORM_ADMIN",
      action: "freight.feature_flags.updated",
      entityType: "FeatureFlag",
      entityId: "freight-marketplace",
      before,
      after,
      requestId: id,
    });
    return NextResponse.json(after, { headers: { "Cache-Control": "private, no-store", "X-Request-Id": id } });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return NextResponse.json(safe.body, { status: safe.status, headers: { "X-Request-Id": id } });
  }
}
