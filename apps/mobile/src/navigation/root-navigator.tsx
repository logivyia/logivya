import { useAuthStore } from "@/auth/auth-store";
import { AppNavigator } from "@/navigation/app-navigator";
import { AuthNavigator } from "@/navigation/auth-navigator";
import { SessionRecoveryScreen } from "@/screens/auth/session-recovery-screen";

export function RootNavigator() {
  const status = useAuthStore((state) => state.status);

  if (status === "authenticated") return <AppNavigator />;
  if (status === "recovering") return <SessionRecoveryScreen />;
  return <AuthNavigator booting={status === "booting"} />;
}
