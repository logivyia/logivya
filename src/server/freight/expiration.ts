import "server-only";

import { prisma } from "@/server/db";

export async function expireMarketplaceListings(now = new Date()) {
  const where = { status: "ACTIVE" as const, expiresAt: { lte: now } };
  const data = { status: "EXPIRED" as const, deactivatedAt: now };
  const [loads, vehicles, drivers] = await prisma.$transaction([
    prisma.freightListing.updateMany({ where, data }),
    prisma.vehicleListing.updateMany({ where, data }),
    prisma.driverListing.updateMany({ where, data }),
  ]);
  return { loads: loads.count, vehicles: vehicles.count, drivers: drivers.count };
}
