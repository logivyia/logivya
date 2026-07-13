import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, useWindowDimensions, View, type ViewProps } from "react-native";

import { useTheme } from "@/theme/theme-provider";

export function Screen({ children, style, ...props }: ViewProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const horizontalPadding = width < 360 ? 14 : width < 768 ? 18 : 28;

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.content, { paddingHorizontal: horizontalPadding }, style]} {...props}>
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
    paddingBottom: 18,
    paddingTop: 18
  }
});
