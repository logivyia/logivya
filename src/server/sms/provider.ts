export type PasswordResetSmsInput = { phone: string; code: string };

export interface SmsProvider {
  sendPasswordResetCode(input: PasswordResetSmsInput): Promise<{ providerId?: string }>;
}

export class UnconfiguredSmsProvider implements SmsProvider {
  async sendPasswordResetCode(): Promise<never> {
    throw new Error("SMS_PROVIDER_NOT_CONFIGURED");
  }
}
