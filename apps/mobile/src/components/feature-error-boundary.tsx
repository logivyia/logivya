import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { captureAppError } from "@/services/crash-reporting";
import { translateCurrent } from "@/i18n/runtime";
import { createMobileRecoveryId } from "@/services/mobile-recovery-context";
import { colors } from "@/theme/colors";

type Props = {
  children: ReactNode;
  feature: string;
};

type State = {
  failed: boolean;
  correlationId: string | null;
};

export class FeatureErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, correlationId: null };

  static getDerivedStateFromError(): State {
    return { failed: true, correlationId: createMobileRecoveryId() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureAppError(error, {
      componentStack: info.componentStack,
      correlationId: this.state.correlationId,
      feature: this.props.feature,
      recoveryStage: "feature-error-boundary",
    });
  }

  private retry = () => {
    this.setState({ failed: false, correlationId: null });
  };

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>{translateCurrent("operationFailedError")}</Text>
        <Text style={styles.description}>{translateCurrent("dataUnavailable")}</Text>
        {this.state.correlationId ? (
          <Text selectable style={styles.correlationId}>{this.state.correlationId}</Text>
        ) : null}
        <Pressable accessibilityRole="button" onPress={this.retry} style={styles.button}>
          <Text style={styles.buttonText}>{translateCurrent("retry")}</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: colors.navy,
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  title: {
    color: colors.white,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  description: {
    color: colors.slateSoft,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    textAlign: "center",
  },
  correlationId: {
    color: colors.slateSoft,
    fontSize: 12,
    marginTop: 12,
    textAlign: "center",
  },
  button: {
    backgroundColor: colors.orange,
    borderRadius: 8,
    marginTop: 24,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  buttonText: {
    color: colors.white,
    fontWeight: "800",
  },
});
