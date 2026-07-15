import { hashOpaqueToken } from "@/server/security/authentication";
import { prisma } from "@/server/db";
import { maskIpAddress } from "@logivya/logging";

type OperationRateLimitInput = {
  scope: string;
  subject: string;
  maxAttempts: number;
  windowMs: number;
  request?: Request;
};

export async function enforceOperationRateLimit(input: OperationRateLimitInput) {
  const subjectHash = hashOpaqueToken(`${input.scope}:${input.subject.trim().toLowerCase()}`);
  const since = new Date(Date.now() - input.windowMs);
  const requestId = input.request?.headers.get("x-request-id")?.slice(0, 128);
  const ipAddress = maskIpAddress(input.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim());

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.scope}:${subjectHash}`}))`;
    const attempts = await tx.rateLimitEvent.count({ where: { scope: input.scope, subjectHash, createdAt: { gte: since } } });
    const blocked = attempts >= input.maxAttempts;
    await tx.rateLimitEvent.create({ data: { scope: input.scope, subjectHash, requestId, ipAddress, blocked } });
    return { blocked, remaining: Math.max(0, input.maxAttempts - attempts - 1) };
  });
  if (result.blocked) throw new Error("RATE_LIMITED");
  return { remaining: result.remaining };
}
