export type ChannelRecipient = { externalId: string; name?: string };
export type ChannelContent = { text?: string; mediaUrl?: string; metadata?: Record<string, unknown> };
export type ChannelSendResult = { externalMessageId: string; acceptedAt: Date };
export type ChannelSessionResult = { externalSessionId: string; connectionArtifact?: string; expiresAt?: Date };

export interface ChannelProvider {
  readonly providerId: string;
  createSession(channelAccountId: string): Promise<ChannelSessionResult>;
  disconnect(externalSessionId: string): Promise<void>;
  synchronize(channelAccountId: string): Promise<void>;
  send(channelAccountId: string, recipient: ChannelRecipient, content: ChannelContent): Promise<ChannelSendResult>;
  healthCheck(channelAccountId: string): Promise<{ healthy: boolean; message?: string }>;
}

export class ChannelProviderRegistry {
  private readonly providers = new Map<string, ChannelProvider>();
  register(provider: ChannelProvider) { this.providers.set(provider.providerId, provider); }
  get(providerId: string) {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Channel provider not registered: ${providerId}`);
    return provider;
  }
}
