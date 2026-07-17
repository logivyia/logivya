import { z } from "zod";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { prisma } from "@/server/db";

const querySchema = z.object({
  status: z.enum(["REQUESTED", "RECEIVED", "VERIFYING", "IDENTITY_VERIFICATION_REQUIRED", "IN_REVIEW", "WAITING_FOR_USER", "PROCESSING", "APPROVED", "PARTIALLY_APPROVED", "COMPLETED", "REJECTED", "CANCELED", "CLOSED"]).optional(),
  type: z.enum(["ACCESS", "EXPORT", "RECTIFICATION", "DELETION", "INFORMATION", "RESTRICTION", "OBJECTION", "PORTABILITY", "CONSENT_WITHDRAWAL", "AUTOMATED_DECISION_REVIEW", "COMPLAINT", "OTHER"]).optional(),
  cursor: z.string().trim().min(8).max(80).optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await requirePlatformAdmin("admin.privacy.read", request);
    const url = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(url.searchParams));
    const requests = await prisma.dataSubjectRequest.findMany({
      where: { status: query.status, type: query.type },
      include: { user: { select: { id: true, name: true, email: true } }, company: { select: { id: true, name: true } }, _count: { select: { messages: true, events: true, exportJobs: true, deletionJobs: true } } },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      cursor: query.cursor ? { publicId: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      take: query.take + 1,
    });
    const hasMore = requests.length > query.take;
    const page = hasMore ? requests.slice(0, query.take) : requests;
    return Response.json({ requests: page, nextCursor: hasMore ? page.at(-1)?.publicId ?? null : null, requestId: id });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return Response.json(safe.body, { status: error instanceof z.ZodError ? 400 : safe.status });
  }
}
