import { Platform } from "react-native";

export function getMobilePlatform() {
  if (Platform.OS === "ios") return "IOS";
  if (Platform.OS === "android") return "ANDROID";
  return "UNKNOWN";
}

export function createDeviceId() {
  return `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
