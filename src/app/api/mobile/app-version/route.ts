import { mobileSuccess } from "@/server/mobile/response";

export const dynamic = "force-dynamic";

function bool(value: string | undefined, fallback = false) {
  if (value == null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

type MobilePlatform = "android" | "ios";

function clientPlatform(request: Request): MobilePlatform | null {
  const value = request.headers.get("x-client-platform")?.trim().toLowerCase();
  return value === "android" || value === "ios" ? value : null;
}

function platformValue(platform: MobilePlatform | null, suffix: string, fallback: string) {
  if (!platform) return fallback;
  return process.env[`MOBILE_${platform.toUpperCase()}_${suffix}`] || fallback;
}

export async function GET(request: Request) {
  const platform = clientPlatform(request);
  const sharedCurrentVersion = process.env.MOBILE_CURRENT_VERSION || process.env.EXPO_PUBLIC_APP_VERSION || "0.1.0";
  const sharedMinimumVersion = process.env.MOBILE_MINIMUM_VERSION || "0.1.0";
  const sharedRecommendedVersion = process.env.MOBILE_RECOMMENDED_VERSION || sharedCurrentVersion;
  const currentVersion = platformValue(platform, "CURRENT_VERSION", sharedCurrentVersion);

  return mobileSuccess({
    currentVersion,
    minimumVersion: platformValue(platform, "MINIMUM_VERSION", sharedMinimumVersion),
    recommendedVersion: platformValue(platform, "RECOMMENDED_VERSION", platform ? currentVersion : sharedRecommendedVersion),
    forceUpdate: bool(
      platform ? process.env[`MOBILE_${platform.toUpperCase()}_FORCE_UPDATE`] : undefined,
      bool(process.env.MOBILE_FORCE_UPDATE),
    ),
    updateUrl: {
      android: process.env.MOBILE_ANDROID_UPDATE_URL || "https://play.google.com/store/apps/details?id=com.logivya.mobile",
      ios: process.env.MOBILE_IOS_UPDATE_URL || "https://apps.apple.com/app/logivya"
    },
    channels: ["development", "staging", "closed-beta", "production"]
  });
}
