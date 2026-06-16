import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { onlineManager, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { type ReactNode, useEffect } from "react";

import { config } from "@/constants/config";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: config.queryRetryCount,
      staleTime: config.queryStaleTimeMs,
      gcTime: config.queryGcTimeMs,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false
    },
    mutations: {
      retry: 1
    }
  }
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "LOGIVYA_QUERY_CACHE"
});

export function OfflineQueryProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      onlineManager.setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });
  }, []);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 24 * 60 * 60_000 }}>
      {children}
    </PersistQueryClientProvider>
  );
}
