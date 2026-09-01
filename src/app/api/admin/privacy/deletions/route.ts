import { z } from "zod";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { requestId, safeAdminError } from "@/server/security/admin-request";

const querySchema = z.object({
  status: z.enum(["QUEUED", "PROCESSING", "READY", "COMPLETED", "FAILED", "EXPIRED", "CANCELED", "BLOCKED"]).optional(),
  take: z.coerce.number().int().min(1).max(200).default(100),
});

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await requirePlatformAdmin("admin.privacy.read", request);
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const jobs = await prisma.privacyDeletionJob.findMany({
      where: { status: query.status },
      include: {
        user: { select: { id: true, name: true, email: true, locale: true } },
        company: { select: { id: true, name: true } },
        request: { select: { publicId: true, status: true, legalHold: true, deadlineAt: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.take,
    });
    return Response.json({ jobs, requestId: id });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return Response.json(safe.body, { status: error instanceof z.ZodError ? 400 : safe.status });
  }
}
