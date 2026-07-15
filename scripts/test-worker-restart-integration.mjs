import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import Redis from "ioredis";

if (process.env.WORKER_RESTART_INTEGRATION !== "1") throw new Error("WORKER_RESTART_INTEGRATION=1 is required.");
if (!process.env.DATABASE_URL?.includes("127.0.0.1") && !process.env.DATABASE_URL?.includes("localhost")) {
  throw new Error("Worker restart integration test requires a localhost PostgreSQL database.");
}
if (!process.env.REDIS_URL?.includes("127.0.0.1") && !process.env.REDIS_URL?.includes("localhost")) {
  throw new Error("Worker restart integration test requires a localhost Redis instance.");
}

const heartbeatKey = "logivya:whatsapp-worker:heartbeat";
const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 });
const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

async function waitForHeartbeat(workerId, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await redis.get(heartbeatKey);
    if (value) {
      const heartbeat = JSON.parse(value);
      if (heartbeat.workerId === workerId) return heartbeat;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`WORKER_HEARTBEAT_TIMEOUT:${workerId}`);
}

async function startAndVerify(workerId, port) {
  const output = [];
  const child = spawn(process.execPath, [tsxCli, "src/worker/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      WORKER_ID: workerId,
      PORT: String(port),
      WORKER_HEARTBEAT_INTERVAL_MS: "500",
      QUEUE_RECOVERY_INTERVAL_MS: "60000",
      WHATSAPP_SESSION_RECOVERY_INTERVAL_MS: "60000",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));
  try {
    const heartbeat = await waitForHeartbeat(workerId);
    assert.equal(heartbeat.workerId, workerId);
    return heartbeat;
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${output.join("").slice(-4000)}`);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 5_000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

try {
  await redis.del(heartbeatKey);
  const first = await startAndVerify("queue-recovery-worker-a", 59010);
  const second = await startAndVerify("queue-recovery-worker-b", 59011);
  assert.notEqual(first.workerId, second.workerId);
  console.log(JSON.stringify({ verified: true, firstWorkerId: first.workerId, secondWorkerId: second.workerId, heartbeatReplaced: true }, null, 2));
} finally {
  await redis.del(heartbeatKey).catch(() => undefined);
  redis.disconnect();
}
