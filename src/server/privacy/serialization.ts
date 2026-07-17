import "server-only";
import type { Prisma } from "@prisma/client";

export const userPrivacyRequestSummarySelect = {
  publicId: true,
  type: true,
  status: true,
  identityVerificationStatus: true,
  reason: true,
  description: true,
  responseSummary: true,
  legalHold: true,
  requestedAt: true,
  receivedAt: true,
  deadlineAt: true,
  completedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DataSubjectRequestSelect;

export const userPrivacyRequestDetailSelect = {
  ...userPrivacyRequestSummarySelect,
  messages: {
    where: { isInternal: false },
    select: { id: true, actorType: true, message: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  },
  events: {
    select: { id: true, action: true, fromStatus: true, toStatus: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.DataSubjectRequestSelect;

export const userPrivacyExportSelect = {
  publicId: true,
  status: true,
  contentType: true,
  sizeBytes: true,
  checksumSha256: true,
  attempts: true,
  expiresAt: true,
  downloadedAt: true,
  lastError: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PrivacyExportJobSelect;
