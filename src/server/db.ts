import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  // Route modules are imported during `next build`; the adapter connects only when queried.
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    if (process.env.NODE_ENV === "production") throw new Error("DATABASE_URL is required in production");
    return new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/logivya" },
        { schema: "public" },
      ),
    });
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema: "public" }) });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
