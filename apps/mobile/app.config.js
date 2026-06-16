const appJson = require("./app.json");

const environment = process.env.APP_ENV || process.env.EAS_BUILD_PROFILE || "development";

const apiBaseUrlByEnvironment = {
  development: process.env.EXPO_PUBLIC_API_BASE_URL || "http://127.0.0.1:3000",
  preview: process.env.EXPO_PUBLIC_API_BASE_URL || "https://www.logivya.com",
  staging: process.env.EXPO_PUBLIC_API_BASE_URL || "https://www.logivya.com",
  production: process.env.EXPO_PUBLIC_API_BASE_URL || "https://www.logivya.com"
};

function getApiBaseUrl() {
  return apiBaseUrlByEnvironment[environment] || apiBaseUrlByEnvironment.development;
}

module.exports = ({ config }) => {
  const baseConfig = appJson.expo;

  return {
    ...config,
    ...baseConfig,
    name: process.env.EXPO_PUBLIC_APP_NAME || baseConfig.name,
    slug: baseConfig.slug,
    owner: process.env.EXPO_PUBLIC_EAS_OWNER || undefined,
    scheme: "logivya",
    version: process.env.EXPO_PUBLIC_APP_VERSION || baseConfig.version,
    runtimeVersion: {
      policy: "appVersion"
    },
    ios: {
      ...baseConfig.ios,
      bundleIdentifier: "com.logivya.mobile",
      buildNumber: process.env.IOS_BUILD_NUMBER || "1",
      config: {
        usesNonExemptEncryption: false
      }
    },
    android: {
      ...baseConfig.android,
      package: "com.logivya.mobile",
      versionCode: Number(process.env.ANDROID_VERSION_CODE || 1),
      adaptiveIcon: {
        foregroundImage: "./assets/icons/adaptive-icon.png",
        backgroundColor: "#0f172a"
      }
    },
    notification: {
      icon: "./assets/icons/notification-icon.png",
      color: "#f97316",
      androidMode: "default",
      androidCollapsedTitle: "Logivya"
    },
    plugins: [
      ...(baseConfig.plugins || []),
      "@sentry/react-native"
    ],
    extra: {
      ...baseConfig.extra,
      environment,
      apiBaseUrl: getApiBaseUrl(),
      sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN || baseConfig.extra?.sentryDsn || "",
      eas: {
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || baseConfig.extra?.eas?.projectId || ""
      }
    }
  };
};
