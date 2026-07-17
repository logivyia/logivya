const fs = require("fs");
const path = require("path");
const appJson = require("./app.json");

const defaultEnvironment = process.env.NODE_ENV === "production" ? "production" : "development";
const environment = process.env.APP_ENV || process.env.EAS_BUILD_PROFILE || defaultEnvironment;
const nativeDiagnosticMode =
  process.env.EXPO_PUBLIC_NATIVE_DIAGNOSTIC === "true" || process.env.EXPO_PUBLIC_STARTUP_TEST === "true";
const disableHermes = process.env.EXPO_PUBLIC_DISABLE_HERMES === "true";
const disableNewArchitecture = process.env.EXPO_PUBLIC_DISABLE_NEW_ARCH === "true";

const nativeDiagnosticAutolinkingExclude = [
  "@react-native-async-storage/async-storage",
  "@react-native-community/datetimepicker",
  "@react-native-community/netinfo",
  "@react-native-firebase/analytics",
  "@react-native-firebase/app",
  "@sentry/react-native",
  "expo-application",
  "expo-asset",
  "expo-device",
  "expo-file-system",
  "expo-font",
  "expo-keep-awake",
  "expo-linking",
  "expo-notifications",
  "expo-secure-store",
  "expo-task-manager",
  "react-native-gesture-handler",
  "react-native-reanimated",
  "react-native-safe-area-context",
  "react-native-screens",
  "react-native-worklets",
  "unimodules-app-loader"
];

const apiBaseUrlByEnvironment = {
  development: process.env.EXPO_PUBLIC_API_BASE_URL || "http://127.0.0.1:3000",
  preview: process.env.EXPO_PUBLIC_API_BASE_URL || "https://www.logivya.com",
  staging: process.env.EXPO_PUBLIC_API_BASE_URL || "https://www.logivya.com",
  production: process.env.EXPO_PUBLIC_API_BASE_URL || "https://www.logivya.com"
};

const apiFallbackBaseUrlsByEnvironment = {
  development: [],
  preview: ["https://logivya.com", "https://logivya.vercel.app"],
  staging: ["https://logivya.com", "https://logivya.vercel.app"],
  production: ["https://logivya.com", "https://logivya.vercel.app"]
};

function getApiBaseUrl() {
  return apiBaseUrlByEnvironment[environment] || apiBaseUrlByEnvironment.development;
}

function getApiFallbackBaseUrls() {
  return apiFallbackBaseUrlsByEnvironment[environment] || apiFallbackBaseUrlsByEnvironment.development;
}

function existingRelativeFile(relativePath) {
  return fs.existsSync(path.join(__dirname, relativePath)) ? `./${relativePath}` : undefined;
}

function pluginName(plugin) {
  return Array.isArray(plugin) ? plugin[0] : plugin;
}

module.exports = ({ config }) => {
  const baseConfig = appJson.expo;
  const appVersion = process.env.EXPO_PUBLIC_APP_VERSION || baseConfig.version;
  const androidVersionCode = Number(process.env.ANDROID_VERSION_CODE || baseConfig.android?.versionCode || 4);
  const releaseId = process.env.LOGIVYA_RELEASE_ID || baseConfig.extra?.releaseId || `android-v${androidVersionCode}-${appVersion}`;
  const androidGoogleServicesFile = nativeDiagnosticMode ? undefined : existingRelativeFile("google-services.json");
  const iosGoogleServicesFile = nativeDiagnosticMode ? undefined : existingRelativeFile("GoogleService-Info.plist");
  const hasFirebaseConfig = Boolean(androidGoogleServicesFile || iosGoogleServicesFile);
  const plugins = (baseConfig.plugins || []).filter((plugin) => {
    const name = pluginName(plugin);
    if (nativeDiagnosticMode) return false;
    if (name === "@react-native-firebase/app" || name === "@react-native-firebase/analytics") return hasFirebaseConfig;
    return true;
  });

  return {
    ...config,
    ...baseConfig,
    name: process.env.EXPO_PUBLIC_APP_NAME || baseConfig.name,
    slug: baseConfig.slug,
    owner: process.env.EXPO_PUBLIC_EAS_OWNER || undefined,
    scheme: "logivya",
    version: appVersion,
    jsEngine: disableHermes ? "jsc" : baseConfig.jsEngine || "hermes",
    newArchEnabled: disableNewArchitecture ? false : baseConfig.newArchEnabled,
    autolinking: nativeDiagnosticMode
      ? {
          exclude: nativeDiagnosticAutolinkingExclude,
          android: {
            exclude: nativeDiagnosticAutolinkingExclude
          }
        }
      : baseConfig.autolinking,
    runtimeVersion: {
      policy: "appVersion"
    },
    ios: {
      ...baseConfig.ios,
      infoPlist: nativeDiagnosticMode ? undefined : baseConfig.ios?.infoPlist,
      bundleIdentifier: "com.logivya.mobile",
      googleServicesFile: iosGoogleServicesFile,
      buildNumber: process.env.IOS_BUILD_NUMBER || baseConfig.ios?.buildNumber || "4",
      config: {
        usesNonExemptEncryption: false
      }
    },
    android: {
      ...baseConfig.android,
      permissions: nativeDiagnosticMode ? ["INTERNET"] : baseConfig.android?.permissions,
      googleServicesFile: androidGoogleServicesFile,
      package: "com.logivya.mobile",
      versionCode: androidVersionCode,
      adaptiveIcon: {
        foregroundImage: "./assets/logivya/mobillogo1.png",
        backgroundColor: "#FFFFFF"
      }
    },
    notification: nativeDiagnosticMode
      ? undefined
      : {
          icon: "./assets/icons/notification-icon.png",
          color: "#FF6B00",
          androidMode: "default",
          androidCollapsedTitle: "Logivya"
        },
    plugins,
    extra: {
      ...baseConfig.extra,
      environment,
      apiBaseUrl: getApiBaseUrl(),
      apiFallbackBaseUrls: getApiFallbackBaseUrls(),
      releaseId,
      gitCommit: process.env.LOGIVYA_GIT_COMMIT || process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || baseConfig.extra?.gitCommit || "unknown",
      buildDate: process.env.LOGIVYA_BUILD_DATE || baseConfig.extra?.buildDate || "unknown",
      apiContractVersion: process.env.LOGIVYA_API_CONTRACT_VERSION || baseConfig.extra?.apiContractVersion || "2026-07-17",
      sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN || baseConfig.extra?.sentryDsn || "",
      nativeDiagnostic: nativeDiagnosticMode,
      eas: {
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || baseConfig.extra?.eas?.projectId || ""
      }
    }
  };
};
