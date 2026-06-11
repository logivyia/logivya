export type AiGenerationRequest = {
  instruction: string;
  input: string;
  sourceLocale?: string;
  targetLocale?: string;
  context?: Record<string, unknown>;
};
export type AiGenerationResult = {
  output: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
};
export interface AiProvider {
  readonly providerId: string;
  generate(request: AiGenerationRequest): Promise<AiGenerationResult>;
  healthCheck(): Promise<{ healthy: boolean; message?: string }>;
}
export class AiProviderStrategy {
  constructor(private readonly providers: Map<string, AiProvider>) {}
  async generate(providerId: string, request: AiGenerationRequest) {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`AI provider not configured: ${providerId}`);
    return provider.generate(request);
  }
}
