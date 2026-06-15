import "react-native-gesture-handler";

import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";

import { RootNavigator } from "@/navigation/root-navigator";
import { useAuthBootstrap } from "@/hooks/use-auth-bootstrap";
import { useSettingsStore } from "@/auth/settings-store";
import { darkNavigationTheme, lightNavigationTheme } from "@/theme/navigation";
import { ThemeProvider } from "@/theme/theme-provider";

export default function App() {
  const systemScheme = useColorScheme();
  const preferredTheme = useSettingsStore((state) => state.theme);
  const themeMode = preferredTheme === "system" ? systemScheme ?? "light" : preferredTheme;

  useAuthBootstrap();

  return (
    <ThemeProvider mode={themeMode}>
      <NavigationContainer theme={themeMode === "dark" ? darkNavigationTheme : lightNavigationTheme}>
        <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
        <RootNavigator />
      </NavigationContainer>
    </ThemeProvider>
  );
}
