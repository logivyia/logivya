export type LogContext = { companyId?: string; userId?: string; correlationId?: string; [key: string]: unknown };
export interface StructuredLogger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: unknown, context?: LogContext): void;
}
export const logger: StructuredLogger = {
  info: (message, context = {}) => console.info(JSON.stringify(redactSensitive({ level: "info", message, ...context, timestamp: new Date().toISOString() }))),
  warn: (message, context = {}) => console.warn(JSON.stringify(redactSensitive({ level: "warn", message, ...context, timestamp: new Date().toISOString() }))),
  error: (message, error, context = {}) => console.error(JSON.stringify(redactSensitive({ level: "error", message, error: error instanceof Error ? error.message : error, ...context, timestamp: new Date().toISOString() }))),
};
import { redactSensitive } from "@/server/security/redaction";
