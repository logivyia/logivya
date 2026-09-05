import { useContext } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, useWindowDimensions, View, type ViewProps } from "react-native";

import { useTheme } from "@/theme/theme-provider";
import { ScreenBottomInsetContext } from "@/components/screen-bottom-inset-context";

export function Screen({ children, style, ...props }: ViewProps) {
  const theme = useTheme();
  const bottomInsetOwned = useContext(ScreenBottomInsetContext);
  const { width } = useWindowDimensions();
  const horizontalPadding = width < 360 ? 14 : width < 768 ? 18 : 28;

  return (
    <SafeAreaView edges={bottomInsetOwned ? ["left", "right"] : ["left", "right", "bottom"]} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.content, { paddingHorizontal: horizontalPadding }, bottomInsetOwned ? styles.withBottomBar : null, style]} {...props}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1
  },
  withBottomBar: {
    paddingBottom: 0
  },
  content: {
    flex: 1,
    paddingBottom: 18,
    paddingTop: 18
  }
});
