import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  captureAppError,
  reportMobileRecoveryIncident,
} from "@/services/crash-reporting";
import { clearRecoverableAppCache } from "@/services/app-recovery";
import { createMobileRecoveryId } from "@/services/mobile-recovery-context";
import { colors } from "@/theme/colors";

type Props = {
  children: ReactNode;
};

type State = {
  failed: boolean;
  recovering: boolean;
  correlationId: string | null;
};

const recoveryCopy = {
  title: "Logivya g\u00fcvenli bi\u00e7imde kurtar\u0131labilir",
  description: "Ge\u00e7ici uygulama verileri yenilenerek tekrar denenecek. Hesap bilgileriniz korunur.",
  correlationLabel: "Kod",
  retry: "Tekrar dene",
  retrying: "Kurtar\u0131l\u0131yor...",
  returnToLogin: "Giri\u015f ekran\u0131na d\u00f6n",
} as const;

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, recovering: false, correlationId: null };

  static getDerivedStateFromError() {
    return {
      failed: true,
      recovering: false,
      correlationId: createMobileRecoveryId(),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (this.state.correlationId) {
      reportMobileRecoveryIncident(
        error,
        this.state.correlationId,
        "root-error-boundary",
      );
    }
    captureAppError(error, {
      componentStack: info.componentStack,
      correlationId: this.state.correlationId,
      recoveryStage: "root-error-boundary",
    });
  }

  private handleRetry = async () => {
    this.setState({ recovering: true });
    try {
      await clearRecoverableAppCache();
      this.setState({ failed: false, recovering: false, correlationId: null });
    } catch (error) {
      captureAppError(error, {
        correlationId: this.state.correlationId,
        recoveryStage: "cache-recovery",
      });
      this.setState({ recovering: false });
    }
  };

  private handleReturnToLogin = async () => {
    this.setState({ recovering: true });
    try {
      const { clearMobileSessionState } = await import("@/auth/session-cleanup");
      await clearRecoverableAppCache();
      await clearMobileSessionState();
      this.setState({ failed: false, recovering: false, correlationId: null });
    } catch (error) {
      captureAppError(error, {
        correlationId: this.state.correlationId,
        recoveryStage: "session-recovery",
      });
      this.setState({ recovering: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <ErrorFallback
        correlationId={this.state.correlationId}
        recovering={this.state.recovering}
        onRetry={this.handleRetry}
        onReturnToLogin={this.handleReturnToLogin}
      />
    );
  }
}

function ErrorFallback({
  correlationId,
  recovering,
  onRetry,
  onReturnToLogin,
}: {
  correlationId: string | null;
  recovering: boolean;
  onRetry: () => void;
  onReturnToLogin: () => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{recoveryCopy.title}</Text>
      <Text style={styles.description}>{recoveryCopy.description}</Text>
      {correlationId ? <Text selectable style={styles.correlationId}>{recoveryCopy.correlationLabel}: {correlationId}</Text> : null}
      <Pressable disabled={recovering} style={[styles.button, recovering && styles.buttonDisabled]} onPress={onRetry}>
        <Text style={styles.buttonText}>{recovering ? recoveryCopy.retrying : recoveryCopy.retry}</Text>
      </Pressable>
      <Pressable disabled={recovering} style={styles.secondaryButton} onPress={onReturnToLogin}>
        <Text style={styles.secondaryButtonText}>{recoveryCopy.returnToLogin}</Text>
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
  correlationId: {
    marginTop: 12,
    color: colors.slateSoft,
    fontSize: 12,
    textAlign: "center"
  },
  button: {
    marginTop: 24,
    borderRadius: 14,
    backgroundColor: colors.orange,
    paddingHorizontal: 22,
    paddingVertical: 12
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: colors.white,
    fontWeight: "800"
  },
  secondaryButton: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10
  },
  secondaryButtonText: {
    color: colors.white,
    fontWeight: "700"
  }
});
