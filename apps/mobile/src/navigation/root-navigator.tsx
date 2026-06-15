import { useAuthStore } from "@/auth/auth-store";
import { AppNavigator } from "@/navigation/app-navigator";
import { AuthNavigator } from "@/navigation/auth-navigator";

export function RootNavigator() {
  const status = useAuthStore((state) => state.status);

  if (status === "authenticated") return <AppNavigator />;
  return <AuthNavigator booting={status === "booting"} />;
}
