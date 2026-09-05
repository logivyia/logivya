import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { BackHandler, Pressable, Text } from "react-native";
import { useEffect, useRef } from "react";
import { useGuestStore } from "@/auth/guest-store";
import { useTheme } from "@/theme/theme-provider";
import { useTranslation } from "@/i18n/use-translation";

import { ForgotPasswordScreen } from "@/screens/auth/forgot-password-screen";
import { LoginScreen } from "@/screens/auth/login-screen";
import { RegisterScreen } from "@/screens/auth/register-screen";
import { ResetPasswordScreen } from "@/screens/auth/reset-password-screen";
import { SplashScreen } from "@/screens/auth/splash-screen";
import type { AuthStackParamList } from "@/types/navigation";

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator({ booting, initialScreen = "Login" }: { booting: boolean; initialScreen?: "Login" | "Register" }) {
  const theme = useTheme(); const { locale } = useTranslation();
  const stackIndex = useRef(0);
  useEffect(() => {
    if (booting) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (stackIndex.current > 0) return false;
      useGuestStore.getState().browse();
      return true;
    });
    return () => listener.remove();
  }, [booting]);
  return (
    <Stack.Navigator initialRouteName={booting ? "Splash" : initialScreen} screenListeners={{ state: event => { stackIndex.current = event.data.state.index; } }} screenOptions={{ headerShown: !booting, headerTitle: "", headerShadowVisible: false, headerStyle: { backgroundColor: theme.background }, headerTintColor: theme.text, headerRight: () => <Pressable style={{ minHeight: 44, justifyContent: "center" }} onPress={() => useGuestStore.getState().browse()}><Text style={{ color: theme.primary, fontWeight: "800" }}>{locale === "tr" ? "İlanlara göz at" : "Browse listings"}</Text></Pressable> }}>
      {booting ? (
        <Stack.Screen name="Splash" component={SplashScreen} />
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
