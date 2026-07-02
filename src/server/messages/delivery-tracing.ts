import { logger, type LogContext } from "@/server/observability/logger";

export type MessageDeliveryTraceContext = LogContext & {
  stage?: never;
  result?: never;
  durationMs?: never;
};

function errorReason(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function traceMessageStage<T>(
  stage: string,
  context: MessageDeliveryTraceContext,
  run: () => Promise<T>,
) {
  const startedAt = Date.now();
  logger.info("message.delivery.stage.entered", { ...context, stage });
  try {
    const value = await run();
    logger.info("message.delivery.stage.exited", {
      ...context,
      stage,
      result: "success",
      durationMs: Date.now() - startedAt,
    });
    return value;
  } catch (error) {
    logger.error("message.delivery.stage.failed", error, {
      ...context,
      stage,
      result: "failed",
      reason: errorReason(error),
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}
