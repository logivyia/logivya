import { z } from "zod";
import { assertPrivacyMutationCsrf, requirePrivacyAuth, requirePrivacyPassword } from "@/server/privacy/auth";
import { PrivacyError, privacyErrorResponse } from "@/server/privacy/errors";
import { createPrivacyRequest } from "@/server/privacy/requests";
import { writeAuditLog } from "@/server/security/audit";
import { prisma } from "@/server/db";
import { userPrivacyRequestDetailSelect } from "@/server/privacy/serialization";

const requestTypes = ["ACCESS", "RECTIFICATION", "INFORMATION", "RESTRICTION", "OBJECTION", "PORTABILITY", "CONSENT_WITHDRAWAL", "AUTOMATED_DECISION_REVIEW", "COMPLAINT", "OTHER"] as const;
const schema = z.object({ type: z.enum(requestTypes), reason: z.string().trim().max(500).optional(), description: z.string().trim().min(10).max(4_000), password: z.string().min(1).max(256) });
const querySchema = z.object({ cursor: z.string().trim().min(8).max(80).optional(), take: z.coerce.number().int().min(1).max(100).default(50) });

export async function GET(request: Request) {
  try {
    const auth = await requirePrivacyAuth(request);
    const url = new URL(request.url);
    const parsedQuery = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsedQuery.success) throw new PrivacyError("VALIDATION_INVALID", 400);
    const query = parsedQuery.data;
    const requests = await prisma.dataSubjectRequest.findMany({
      where: { userId: auth.user.id, companyId: auth.company.id },
      select: userPrivacyRequestDetailSelect,
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      cursor: query.cursor ? { publicId: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      take: query.take + 1,
    });
    const hasMore = requests.length > query.take;
    const page = hasMore ? requests.slice(0, query.take) : requests;
    return Response.json({ requests: page, nextCursor: hasMore ? page.at(-1)?.publicId ?? null : null });
  } catch (error) {
    return privacyErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertPrivacyMutationCsrf(request);
    const auth = await requirePrivacyAuth(request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PrivacyError("VALIDATION_INVALID", 400);
    await requirePrivacyPassword(auth.user, parsed.data.password);
    const privacyRequest = await createPrivacyRequest({ companyId: auth.company.id, userId: auth.user.id, type: parsed.data.type, reason: parsed.data.reason, description: parsed.data.description, metadata: { source: auth.authSource } });
    await writeAuditLog(request, { companyId: auth.company.id, userId: auth.user.id, actorEmail: auth.user.email, action: "privacy.request.created", entityType: "DataSubjectRequest", entityId: privacyRequest.id, after: { publicId: privacyRequest.publicId, type: privacyRequest.type, status: privacyRequest.status } });
    return Response.json({ request: privacyRequest }, { status: 201 });
  } catch (error) {
    return privacyErrorResponse(error);
  }
}
