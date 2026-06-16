import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { captureAppError } from "@/services/crash-reporting";

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

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Logivya yeniden baslatilmali</Text>
        <Text style={styles.description}>Beklenmeyen bir hata olustu. Tekrar deneyebilirsiniz.</Text>
        <Pressable style={styles.button} onPress={() => this.setState({ failed: false })}>
          <Text style={styles.buttonText}>Tekrar dene</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#0f172a"
  },
  title: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center"
  },
  description: {
    marginTop: 10,
    color: "#cbd5e1",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center"
  },
  button: {
    marginTop: 24,
    borderRadius: 14,
    backgroundColor: "#ff6b00",
    paddingHorizontal: 22,
    paddingVertical: 12
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "800"
  }
});
