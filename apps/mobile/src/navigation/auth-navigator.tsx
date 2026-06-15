import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { ForgotPasswordScreen } from "@/screens/auth/forgot-password-screen";
import { LoginScreen } from "@/screens/auth/login-screen";
import { RegisterScreen } from "@/screens/auth/register-screen";
import { ResetPasswordScreen } from "@/screens/auth/reset-password-screen";
import { SplashScreen } from "@/screens/auth/splash-screen";
import type { AuthStackParamList } from "@/types/navigation";

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator({ booting }: { booting: boolean }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
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
