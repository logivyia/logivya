import { useAuthStore } from "@/auth/auth-store";
import { AppNavigator } from "@/navigation/app-navigator";
import { AuthNavigator } from "@/navigation/auth-navigator";
import { SessionRecoveryScreen } from "@/screens/auth/session-recovery-screen";
import { useSettingsStore } from "@/auth/settings-store";
import { OnboardingScreen } from "@/screens/onboarding/onboarding-screen";
import { useEffect } from "react";
import { Linking } from "react-native";
import { useGuestStore } from "@/auth/guest-store";
import { GuestNavigator } from "@/navigation/guest-navigator";

export function RootNavigator() {
  const status = useAuthStore((state) => state.status);
  const onboardingCompleted = useSettingsStore((state) => state.onboardingCompleted);
  const settingsHydrated = useSettingsStore((state) => state.hydrated);
  const authScreen = useGuestStore((state) => state.authScreen);
  useEffect(() => {
    const openAuthLink = (url: string | null) => { if (url && /(?:login|register|forgot-password|reset-password)(?:[/?#]|$)/u.test(url)) useGuestStore.getState().authenticate(url.includes("register") ? "Register" : "Login"); };
    void Linking.getInitialURL().then(openAuthLink);
    const listener = Linking.addEventListener("url", ({ url }) => openAuthLink(url));
    return () => listener.remove();
  }, []);
  useEffect(() => { if (status === "authenticated") useGuestStore.getState().browse(); }, [status]);

  if (status === "authenticated" && !settingsHydrated) return <SessionRecoveryScreen />;
  if (status === "authenticated") return onboardingCompleted ? <AppNavigator /> : <OnboardingScreen />;
  if (status === "recovering") return <SessionRecoveryScreen />;
  if (status === "booting") return <AuthNavigator booting />;
  return <GuestNavigator />;
}
