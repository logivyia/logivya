import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, View, type ViewProps } from "react-native";

import { useTheme } from "@/theme/theme-provider";

export function Screen({ children, style, ...props }: ViewProps) {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.content, style]} {...props}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1
  },
  content: {
    flex: 1,
    padding: 24
  }
});
