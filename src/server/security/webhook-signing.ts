import { createHmac, timingSafeEqual } from "node:crypto";
import type { WebhookSigner } from "@/server/webhooks/contracts";

export class HmacWebhookSigner implements WebhookSigner {
  async sign(payload: string, secret: string) { return createHmac("sha256", secret).update(payload).digest("base64url"); }
  async verify(payload: string, signature: string, secret: string) {
    const actual = Buffer.from(await this.sign(payload, secret));
    const expected = Buffer.from(signature);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
