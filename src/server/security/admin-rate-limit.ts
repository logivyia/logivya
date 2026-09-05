import { createHash } from "node:crypto";
import { isMutationRequest } from "@/server/security/request-origin";

/** Identity, not caller-controlled forwarded IP, determines the admin budget. */
export function adminRateLimitPolicy(request: Pick<Request, "method">, userId: string, permission: string) {
  const mutation = isMutationRequest(request);
  const subject = createHash("sha256").update(JSON.stringify([userId, permission, request.method.toUpperCase()])).digest("hex");
  return { key: `logivya:admin:v2:${subject}`, max: mutation ? 20 : 240, windowSeconds: mutation ? 600 : 60 };
}

// Atomic increment/expiry also repairs an old counter with no TTL. Capped at
// max+1 so repeated blocked requests cannot increase storage or overflow it.
export const ADMIN_RATE_LIMIT_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local maximum = tonumber(ARGV[2])
if current <= maximum then current = redis.call('INCR', KEYS[1]) end
if redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return current
`;

export async function consumeAdminRateLimit(
  client: { eval(script: string, numberOfKeys: number, ...args: (string | number)[]): Promise<unknown> },
  policy: ReturnType<typeof adminRateLimitPolicy>,
) {
  const value = await client.eval(ADMIN_RATE_LIMIT_SCRIPT, 1, policy.key, policy.windowSeconds, policy.max);
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("ADMIN_RATE_LIMIT_UNAVAILABLE");
  if (count > policy.max) throw new Error("ADMIN_RATE_LIMITED");
}
