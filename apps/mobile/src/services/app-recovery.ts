import AsyncStorage from "@react-native-async-storage/async-storage";

import { queryClient } from "@/services/offline-query";

const recoverableCacheKeys = [
  "LOGIVYA_QUERY_CACHE",
] as const;

export async function clearRecoverableAppCache() {
  queryClient.clear();
  await AsyncStorage.multiRemove([...recoverableCacheKeys]);
}
