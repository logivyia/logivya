import {
  LOG_LEVELS,
  normalizeEventName,
  redactSensitive,
  serializeLogError,
  type LogLevel,
  type StructuredLogContext,
} from "@logivya/logging";

export type LogContext = StructuredLogContext;

export interface StructuredLogger {
  debug(eventName: string, context?: LogContext): void;
  info(eventName: string, context?: LogContext): void;
  warn(eventName: string, context?: LogContext): void;
  error(eventName: string, error?: unknown, context?: LogContext): void;
  fatal(eventName: string, error?: unknown, context?: LogContext): void;
  child(context: LogContext): StructuredLogger;
}

type StructuredLogEvent = Record<string, unknown> & {
  timestamp: string;
  level: LogLevel;
  service: string;
  environment: string;
  eventName: string;
};

type LogSink = (event: StructuredLogEvent, formatted: string) => void;

const LEVEL_WEIGHT = Object.fromEntries(LOG_LEVELS.map((level, index) => [level, index])) as Record<LogLevel, number>;
const configuredLevel = (process.env.LOG_LEVEL?.toLowerCase() || (process.env.NODE_ENV === "production" ? "info" : "debug")) as LogLevel;
const minimumLevel = configuredLevel in LEVEL_WEIGHT ? configuredLevel : "info";
const isWorker = Boolean(process.env.WORKER_ID || process.env.RENDER_SERVICE_NAME?.toLowerCase().includes("worker"));
const baseContext: LogContext = {
  service: process.env.LOG_SERVICE_NAME || process.env.RENDER_SERVICE_NAME || (isWorker ? "logivya-worker" : "logivya-web"),
  environment: process.env.LOG_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
  gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "unknown",
  releaseVersion: process.env.LOG_RELEASE_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || process.env.RENDER_GIT_COMMIT || "local",
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID || process.env.RENDER_SERVICE_ID || process.env.DEPLOYMENT_ID || "local",
  appVersion: process.env.APP_VERSION || "unknown",
};

let testSink: LogSink | undefined;

function defaultSink(event: StructuredLogEvent, formatted: string) {
  const output = process.env.NODE_ENV === "production" ? JSON.stringify(event) : formatted;
  if (event.level === "error" || event.level === "fatal") console.error(output);
  else console.info(output);
}

function formatLocal(event: StructuredLogEvent) {
  const { timestamp, level, service, eventName, ...context } = event;
  const suffix = Object.keys(context).length ? ` ${JSON.stringify(context)}` : "";
  return `${timestamp} ${level.toUpperCase()} ${service} ${eventName}${suffix}`;
}

function emit(level: LogLevel, eventName: string, context: LogContext, error?: unknown) {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minimumLevel]) return;
  try {
    const safeContext = redactSensitive(context) as LogContext;
    const event = redactSensitive({
      ...baseContext,
      ...safeContext,
      timestamp: new Date().toISOString(),
      level,
      eventName: normalizeEventName(eventName),
      ...(error === undefined ? {} : { error: serializeLogError(error, { includeStack: process.env.LOG_INCLUDE_STACKS !== "false" }) }),
    }) as StructuredLogEvent;
    (testSink ?? defaultSink)(event, formatLocal(event));
  } catch {
    // Observability must not interrupt authentication, delivery, or recovery paths.
  }
}

function createLogger(boundContext: LogContext = {}): StructuredLogger {
  return {
    debug: (eventName, context = {}) => emit("debug", eventName, { ...boundContext, ...context }),
    info: (eventName, context = {}) => emit("info", eventName, { ...boundContext, ...context }),
    warn: (eventName, context = {}) => emit("warn", eventName, { ...boundContext, ...context }),
    error: (eventName, error, context = {}) => emit("error", eventName, { ...boundContext, ...context }, error),
    fatal: (eventName, error, context = {}) => emit("fatal", eventName, { ...boundContext, ...context }, error),
    child: (context) => createLogger({ ...boundContext, ...context }),
  };
}

export const logger = createLogger();

export function setLogSinkForTests(sink?: LogSink) {
  testSink = sink;
}
