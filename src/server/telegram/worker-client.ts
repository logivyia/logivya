import "server-only";

export type TelegramWorkerAuthState =
  | "STARTING"
  | "WAIT_PHONE_NUMBER"
  | "WAIT_EMAIL_ADDRESS"
  | "WAIT_EMAIL_CODE"
  | "WAIT_CODE"
  | "WAIT_PASSWORD"
  | "WAIT_OTHER_DEVICE"
  | "READY"
  | "LOGGING_OUT"
  | "CLOSED"
  | "ERROR";

type WorkerResponse<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } };

function workerConfiguration() {
  const url = process.env.TELEGRAM_WORKER_URL?.replace(/\/$/, "");
  const secret = process.env.TELEGRAM_WORKER_SECRET;
  if (!url || !secret) throw new Error("TELEGRAM_WORKER_NOT_CONFIGURED");
  return { url, secret };
}

export async function callTelegramWorker<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}) {
  const { url, secret } = workerConfiguration();
  const response = await fetch(`${url}${path}`, {
    method: init.method ?? "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
  });
  const payload = await response.json().catch(() => null) as WorkerResponse<T> | null;
  if (!response.ok || !payload?.ok) {
    const code = payload && !payload.ok ? payload.error.code : `TELEGRAM_WORKER_HTTP_${response.status}`;
    throw new Error(code);
  }
  return payload.data;
}

