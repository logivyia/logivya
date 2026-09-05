import { NativeModules, Platform } from "react-native";

import { apiClient } from "@/api/client";
import { trackEvent } from "@/services/analytics";

type PlayIntegrityNativeModule = {
  prepare(): Promise<void>;
  requestToken(requestHash: string): Promise<string>;
};

type IntegrityChallenge = {
  available: boolean;
  mode: "off" | "monitor" | "enforce";
  challengeToken?: string;
  requestHash?: string;
  expiresAt?: string;
};

type IntegrityVerification = {
  configured: boolean;
  verified: boolean;
  verdict: "trusted" | "untrusted" | "unavailable";
  reasons: string[];
};

const nativeIntegrity = NativeModules.PlayIntegrity as PlayIntegrityNativeModule | undefined;
let initialization: Promise<void> | null = null;

async function runIntegrityCheck() {
  if (Platform.OS !== "android" || !nativeIntegrity) return;

  await nativeIntegrity.prepare();
  const challenge = await apiClient.post<IntegrityChallenge>(
    "/api/mobile/integrity/challenge",
    { action: "APP_START" },
    { auth: false, retry: false },
  );
  if (!challenge.available || !challenge.challengeToken || !challenge.requestHash) return;

  const integrityToken = await nativeIntegrity.requestToken(challenge.requestHash);
  const result = await apiClient.post<IntegrityVerification>(
    "/api/mobile/integrity/verify",
    { challengeToken: challenge.challengeToken, integrityToken },
    { auth: false, retry: false },
  );

  await trackEvent("play_integrity_verification", {
    configured: result.configured,
    verified: result.verified,
    verdict: result.verdict,
    reasons: result.reasons,
  });
}

export function initializePlayIntegrity() {
  if (!initialization) {
    initialization = runIntegrityCheck().catch(async (error) => {
      await trackEvent("play_integrity_unavailable", {
        code: error instanceof Error ? error.name : "UNKNOWN",
      });
    });
  }
  return initialization;
}
