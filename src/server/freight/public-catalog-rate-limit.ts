import "server-only";
import { createHash } from "node:crypto";
import Redis from "ioredis";
import { redisConnectionOptions } from "@/server/queues/client";
import { ADMIN_RATE_LIMIT_SCRIPT } from "@/server/security/admin-rate-limit";
let client: Redis | undefined;
let connection: Promise<void> | undefined;
export async function enforcePublicCatalogRateLimit(request: Request) {
  if (!client || client.status === "end") {
    client = new Redis({ ...redisConnectionOptions(), lazyConnect: true, maxRetriesPerRequest: 1, commandTimeout: 3000, connectTimeout: 3000 });
    client.on("error", () => undefined);
    const connectingClient = client;
    connection = client.connect().catch((error) => {
      connectingClient.disconnect();
      if (client === connectingClient) { client = undefined; connection = undefined; }
      throw error;
    });
  }
  await connection;
  // The edge overwrites forwarded IP. Never persist raw visitor addresses.
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `public-catalog:${createHash("sha256").update(address).digest("hex")}`;
  if (!client) throw new Error("RATE_LIMIT_UNAVAILABLE");
  const count = Number(await client.eval(ADMIN_RATE_LIMIT_SCRIPT, 1, key, 60, 120));
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("RATE_LIMIT_UNAVAILABLE");
  if (count > 120) throw new Error("RATE_LIMITED");
}
