import { timingSafeEqual } from "node:crypto";

/** Missing configuration never becomes a valid Bearer credential. */
export function isInternalJobAuthorized(request: Request, secret = process.env.CRON_SECRET) {
  if (!secret?.trim()) return false;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
