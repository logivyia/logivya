import { mobileSuccess } from "@/server/mobile/response";

export const dynamic = "force-dynamic";

function bool(value: string | undefined, fallback = false) {
  if (value == null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export async function GET() {
  return mobileSuccess({
    currentVersion: process.env.MOBILE_CURRENT_VERSION || process.env.EXPO_PUBLIC_APP_VERSION || "0.1.0",
    minimumVersion: process.env.MOBILE_MINIMUM_VERSION || "0.1.0",
    recommendedVersion: process.env.MOBILE_RECOMMENDED_VERSION || process.env.MOBILE_CURRENT_VERSION || "0.1.0",
    forceUpdate: bool(process.env.MOBILE_FORCE_UPDATE),
    updateUrl: {
      android: process.env.MOBILE_ANDROID_UPDATE_URL || "https://play.google.com/store/apps/details?id=com.logivya.mobile",
      ios: process.env.MOBILE_IOS_UPDATE_URL || "https://apps.apple.com/app/logivya"
    },
    channels: ["development", "staging", "closed-beta", "production"]
  });
}
