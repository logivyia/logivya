import { Platform } from "react-native";
import Constants from "expo-constants";
import { config } from "@/constants/config";
import { apiClient } from "@/api/client";

export type MobileAppVersionPolicy = {
  currentVersion: string;
  minimumVersion: string;
  recommendedVersion: string;
  forceUpdate: boolean;
  updateUrl: {
    android: string;
    ios: string;
  };
  channels: string[];
};

export function getCurrentAppVersion() {
  return Constants.expoConfig?.version || "0.1.0";
}

export function getCurrentBuildChannel() {
  return Constants.expoConfig?.extra?.environment || "development";
}

export function getCurrentReleaseMetadata() {
  return {
    releaseId: config.releaseId,
    gitCommit: config.gitCommit,
    buildDate: config.buildDate,
    apiContractVersion: config.apiContractVersion,
    versionCode: config.versionCode
  };
}

export function getPlatformUpdateUrl(policy: MobileAppVersionPolicy) {
  return Platform.OS === "ios" ? policy.updateUrl.ios : policy.updateUrl.android;
}

export function getMobileAppVersionPolicy() {
  return apiClient.request<MobileAppVersionPolicy>("/api/mobile/app-version", { auth: false });
}
