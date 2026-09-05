export const SEND_RESTRICTION_COOLDOWN_MS = 5 * 60_000;
export const CAMPAIGN_PAIR_COOLDOWN_MS = 5 * 60_000;

export function sendIntervalMs(environment: Record<string, string | undefined> = process.env) {
  const configuredDelay = Number(environment.WHATSAPP_MIN_DELAY_MS || 6000);
  const configuredRate = Number(environment.WHATSAPP_MAX_MESSAGES_PER_MINUTE || 10);
  const delay = Number.isFinite(configuredDelay) && configuredDelay > 0 ? configuredDelay : 6000;
  const rate = Number.isFinite(configuredRate) && configuredRate > 0 ? configuredRate : 10;
  // Keep the existing rate ceiling; a short queue delay must not create a burst.
  return Math.ceil(Math.max(6000, delay, 60_000 / Math.min(10, rate)));
}

export function isWhatsAppSendRestriction(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const detail = error as { output?: { statusCode?: number }; statusCode?: number; data?: { status?: number }; message?: string };
  if ([detail.output?.statusCode, detail.statusCode, detail.data?.status].includes(429)) return true;
  // A group's permission error is not evidence that the account is restricted.
  return /rate[-_ ]overlimit|too many requests|temporarily banned|account (?:is )?restricted/i.test(detail.message ?? "");
}

export class WhatsAppSendSafetyError extends Error {
  constructor(code: "WHATSAPP_SEND_PAUSED" | "WHATSAPP_SEND_SAFETY_UNAVAILABLE") {
    super(code);
    this.name = "WhatsAppSendSafetyError";
  }
}

export interface SendSafetyStore {
  /** Atomic: return -1 when paused, 0 for a permit, or milliseconds to wait. */
  reserve(accountId: string, intervalMs: number): Promise<number>;
  pause(accountId: string, durationMs: number): Promise<void>;
}

export class WhatsAppSendSafety {
  private readonly pendingPauses = new Map<string, number>();

  constructor(
    private readonly store: SendSafetyStore,
    private readonly intervalMs: number,
    private readonly sleep: (milliseconds: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly now: () => number = Date.now,
  ) {}

  async send<T>(accountId: string, dispatch: () => Promise<T>): Promise<T> {
    try {
      const pendingUntil = this.pendingPauses.get(accountId);
      if (pendingUntil && pendingUntil > this.now()) {
        await this.store.pause(accountId, pendingUntil - this.now());
        this.pendingPauses.delete(accountId);
      }
      for (;;) {
        const waitMs = await this.store.reserve(accountId, this.intervalMs);
        if (waitMs === -1) throw new WhatsAppSendSafetyError("WHATSAPP_SEND_PAUSED");
        if (waitMs === 0) break;
        if (!Number.isFinite(waitMs) || waitMs < 0) throw new Error("Invalid send permit");
        await this.sleep(Math.min(waitMs, 30_000));
      }
    } catch (error) {
      if (error instanceof WhatsAppSendSafetyError) throw error;
      throw new WhatsAppSendSafetyError("WHATSAPP_SEND_SAFETY_UNAVAILABLE");
    }
    // No fallible persistence after successful dispatch: do not lose its message key.
    try {
      return await dispatch();
    } catch (error) {
      if (!isWhatsAppSendRestriction(error)) throw error;
      this.pendingPauses.set(accountId, this.now() + SEND_RESTRICTION_COOLDOWN_MS);
      try {
        await this.store.pause(accountId, SEND_RESTRICTION_COOLDOWN_MS);
        this.pendingPauses.delete(accountId);
      } catch {
        // Keep blocking this account locally and persist before any later dispatch.
        throw new WhatsAppSendSafetyError("WHATSAPP_SEND_SAFETY_UNAVAILABLE");
      }
      throw new WhatsAppSendSafetyError("WHATSAPP_SEND_PAUSED");
    }
  }
}
