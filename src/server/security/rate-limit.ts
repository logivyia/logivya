export type RateLimitRule = { windowMs: number; maxRequests: number; burst: number };
export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: Date }>;
}
export async function enforceRateLimit(store: RateLimitStore, key: string, rule: RateLimitRule) {
  const result = await store.increment(key, rule.windowMs);
  if (result.count > rule.maxRequests + rule.burst) throw new Error(`Rate limit exceeded until ${result.resetAt.toISOString()}`);
  return result;
}
