import "server-only";
import { assertWebMutationOrigin } from "@/server/security/request-origin";

export function assertSubscriptionRequestCsrf(request: Request) {
  // These routes use requireApiSession (cookies), never mobile bearer auth.
  assertWebMutationOrigin(request);
}
