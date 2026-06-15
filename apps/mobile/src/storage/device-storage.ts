import * as SecureStore from "expo-secure-store";

import { createDeviceId } from "@/utils/device";

const DEVICE_ID_KEY = "logivya.deviceId";

export async function getOrCreateDeviceId() {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;

  const deviceId = createDeviceId();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  return deviceId;
}
