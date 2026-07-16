import { prisma } from "../src/server/db";
import { getSystemHealthSnapshot } from "../src/server/monitoring/health";
import { disconnectWorkerHeartbeatClient } from "../src/server/whatsapp/worker-heartbeat";

async function main() {
  const snapshot = await getSystemHealthSnapshot();
  process.stdout.write(`${JSON.stringify({
    status: snapshot.status,
    environment: snapshot.environment,
    release: snapshot.release,
    generatedAt: snapshot.generatedAt,
    services: snapshot.services.map((service) => ({
      id: service.id,
      state: service.state,
      latencyMs: service.latencyMs,
      safeErrorCode: service.safeErrorCode,
      metrics: service.metrics,
    })),
    queues: snapshot.queues,
    activeIncidentCount: snapshot.incidents.length,
    openAlertCount: snapshot.alerts.length,
    capacityWarnings: snapshot.capacityWarnings,
  }, null, 2)}\n`);
}

void main()
  .then(async () => {
    disconnectWorkerHeartbeatClient();
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    disconnectWorkerHeartbeatClient();
    await prisma.$disconnect();
  });
