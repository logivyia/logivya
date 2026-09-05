import type { FirebasePerformanceTypes } from "@react-native-firebase/perf";
import { Platform } from "react-native";

import { useSettingsStore } from "@/auth/settings-store";

declare const require: (name: string) => unknown;

type PerformanceModule = FirebasePerformanceTypes.Module;
type PerformancePackage = {
  default?: () => PerformanceModule;
};
type StoppableTrace = {
  stop: () => Promise<unknown>;
};

let performanceModule: PerformanceModule | null | undefined;
let activeScreenTrace: StoppableTrace | null = null;
let screenTraceQueue: Promise<void> = Promise.resolve();

function loadPerformanceModule() {
  if (Platform.OS !== "android") return null;
  if (performanceModule !== undefined) return performanceModule;

  try {
    const loadedModule = require("@react-native-firebase/perf") as PerformancePackage;
    performanceModule = loadedModule.default?.() ?? null;
  } catch {
    performanceModule = null;
  }

  return performanceModule;
}

function performanceCollectionAllowed() {
  return Platform.OS === "android" && useSettingsStore.getState().diagnosticsEnabled;
}

function normalizeTraceName(screenName: string) {
  const normalized = screenName
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^_+/, "")
    .slice(0, 80);
  return `screen_${normalized || "unknown"}`;
}

async function stopActiveScreenTrace() {
  const trace = activeScreenTrace;
  activeScreenTrace = null;
  await trace?.stop().catch(() => undefined);
}

async function startScreenTrace(screenName: string) {
  await stopActiveScreenTrace();
  if (!performanceCollectionAllowed()) return;

  const instance = loadPerformanceModule();
  if (!instance) return;

  const traceName = normalizeTraceName(screenName);
  try {
    activeScreenTrace = await instance.startScreenTrace(traceName);
  } catch {
    activeScreenTrace = await instance.startTrace(traceName).catch(() => null);
  }
}

export async function configurePerformanceMonitoring(enabled: boolean) {
  if (Platform.OS !== "android") return;
  const instance = loadPerformanceModule();
  if (!instance) return;

  try {
    instance.dataCollectionEnabled = enabled;
    if (!enabled) await stopActiveScreenTrace();
  } catch {
    performanceModule = null;
  }
}

export function trackPerformanceScreen(screenName?: string) {
  if (!screenName || Platform.OS !== "android") return Promise.resolve();
  screenTraceQueue = screenTraceQueue
    .then(() => startScreenTrace(screenName))
    .catch(() => undefined);
  return screenTraceQueue;
}

export function stopPerformanceScreenTracking() {
  screenTraceQueue = screenTraceQueue
    .then(() => stopActiveScreenTrace())
    .catch(() => undefined);
  return screenTraceQueue;
}
