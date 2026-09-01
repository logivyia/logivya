import "server-only";

import { prisma } from "@/server/db";

export type PublicSourceMetadata = {
  explicitCompanyName: string | null;
  explicitAdvertiserName: string | null;
};

export async function readPublicSourceMetadata(sourceExtractionIds: Array<string | null | undefined>) {
  const ids = [...new Set(sourceExtractionIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map<string, PublicSourceMetadata>();

  const rows = await prisma.whatsAppListingExtraction.findMany({
    where: { id: { in: ids } },
    select: { id: true, companyName: true, contactName: true },
  });

  return new Map(rows.map((row) => [row.id, {
    explicitCompanyName: row.companyName,
    explicitAdvertiserName: row.contactName,
  }]));
}
