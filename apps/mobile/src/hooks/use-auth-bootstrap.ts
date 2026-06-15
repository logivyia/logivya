import { useEffect } from "react";

import { restoreSession } from "@/auth/auth-service";

export function useAuthBootstrap() {
  useEffect(() => {
    void restoreSession();
  }, []);
}
