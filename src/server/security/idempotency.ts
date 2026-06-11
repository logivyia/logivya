import { createHash } from "node:crypto";

export function hashIdempotencyValue(value: string) { return createHash("sha256").update(value).digest("base64url"); }
export interface IdempotencyRepository {
  acquire(input: { companyId: string; keyHash: string; operation: string; requestHash: string; expiresAt: Date }): Promise<{ acquired: boolean; responseCode?: number; responseBody?: unknown }>;
  complete(input: { companyId: string; keyHash: string; operation: string; responseCode: number; responseBody: unknown }): Promise<void>;
}
export async function withIdempotency<T>(
  repository: IdempotencyRepository,
  input: { companyId: string; key: string; operation: string; request: unknown },
  operation: () => Promise<{ statusCode: number; body: T }>,
) {
  const keyHash = hashIdempotencyValue(input.key);
  const requestHash = hashIdempotencyValue(JSON.stringify(input.request));
  const lock = await repository.acquire({ companyId: input.companyId, keyHash, operation: input.operation, requestHash, expiresAt: new Date(Date.now() + 86_400_000) });
  if (!lock.acquired) return { statusCode: lock.responseCode ?? 409, body: lock.responseBody as T };
  const result = await operation();
  await repository.complete({ companyId: input.companyId, keyHash, operation: input.operation, responseCode: result.statusCode, responseBody: result.body });
  return result;
}
