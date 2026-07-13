import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { captureAppError } from "@/services/crash-reporting";
import { useTranslation } from "@/i18n/use-translation";
import { colors } from "@/theme/colors";

type Props = {
  children: ReactNode;
};

type State = {
  failed: boolean;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureAppError(error, { componentStack: info.componentStack });
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return <ErrorFallback onRetry={() => this.setState({ failed: false })} />;
  }
}

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("appRestartRequired")}</Text>
      <Text style={styles.description}>{t("unexpectedError")}</Text>
      <Pressable style={styles.button} onPress={onRetry}>
        <Text style={styles.buttonText}>{t("retry")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.navy
  },
  title: {
    color: colors.white,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center"
  },
  description: {
    marginTop: 10,
    color: colors.slateSoft,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center"
  },
  button: {
    marginTop: 24,
    borderRadius: 14,
    backgroundColor: colors.orange,
    paddingHorizontal: 22,
    paddingVertical: 12
  },
  buttonText: {
    color: colors.white,
    fontWeight: "800"
  }
});
