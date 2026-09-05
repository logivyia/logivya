import type { Prisma } from "@prisma/client";
import type { WAMessageKey } from "@whiskeysockets/baileys";

export const UNKNOWN_DELIVERY_OUTCOME = "WHATSAPP_DELIVERY_OUTCOME_UNKNOWN";
export function hasUnconfirmedDelivery(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && "pendingDelivery" in value && value.pendingDelivery);
}
export function pendingDeliveryState(keys: WAMessageKey[], partIndex: number): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify({ version: 2, keys, deletedKeyIds: [], pendingDelivery: { partIndex, startedAt: new Date().toISOString() } })) as Prisma.InputJsonValue;
}
export class UnknownDeliveryOutcomeError extends Error {
  constructor() { super(UNKNOWN_DELIVERY_OUTCOME); this.name = "UnknownDeliveryOutcomeError"; }
}

/** The provider calls beforeTransport only AFTER preflight, immediately BEFORE network send.
 * An unresolved durable intent is never safe to automatically resend, even after a process crash. */
export async function sendWithDeliveryIntent<T>(input: {
  persistIntent: () => Promise<void>;
  send: (beforeTransport: () => Promise<void>) => Promise<T>;
  persistResult: (result: T) => Promise<void>;
}): Promise<T> {
  let transportStarted = false;
  try {
    const result = await input.send(async () => {
      await input.persistIntent();
      transportStarted = true;
    });
    if (!transportStarted) throw new Error("DELIVERY_INTENT_CALLBACK_REQUIRED");
    await input.persistResult(result);
    return result;
  } catch (error) {
    if (transportStarted) throw new UnknownDeliveryOutcomeError();
    throw error;
  }
}
