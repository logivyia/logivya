import * as SecureStore from "expo-secure-store";

import { captureAppError } from "@/services/crash-reporting";
import { createDeviceId } from "@/utils/device";

const DEVICE_ID_KEY = "logivya.deviceId";

function toSecureStoreString(value: unknown) {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : String(value);
}

export async function getOrCreateDeviceId() {
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (existing) return existing;
  } catch (error) {
    captureAppError(error, { source: "secure-store-read-device-id" });
  }

  const deviceId = createDeviceId();
  try {
    const normalizedDeviceId = toSecureStoreString(deviceId);
    if (normalizedDeviceId) await SecureStore.setItemAsync(DEVICE_ID_KEY, normalizedDeviceId);
  } catch (error) {
    captureAppError(error, { source: "secure-store-save-device-id" });
  }
  return deviceId;
}
