const nativeDiagnosticMode =
  process.env.EXPO_PUBLIC_NATIVE_DIAGNOSTIC === "true" || process.env.EXPO_PUBLIC_STARTUP_TEST === "true";

const disabledNativeDependencies = [
  "@react-native-async-storage/async-storage",
  "@react-native-community/netinfo",
  "@react-native-firebase/analytics",
  "@react-native-firebase/app",
  "@sentry/react-native",
  "expo",
  "expo-application",
  "expo-asset",
  "expo-constants",
  "expo-device",
  "expo-file-system",
  "expo-font",
  "expo-keep-awake",
  "expo-linking",
  "expo-modules-core",
  "expo-notifications",
  "expo-secure-store",
  "expo-task-manager",
  "react-native-gesture-handler",
  "react-native-reanimated",
  "react-native-safe-area-context",
  "react-native-screens",
  "react-native-worklets"
];

module.exports = nativeDiagnosticMode
  ? {
      dependencies: Object.fromEntries(
        disabledNativeDependencies.map((name) => [
          name,
          {
            platforms: {
              android: null
            }
          }
        ])
      )
    }
  : {};
