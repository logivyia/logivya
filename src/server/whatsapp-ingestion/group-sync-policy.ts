export const DEFAULT_AUTO_GROUP_INGESTION_MINIMUM_CONFIDENCE = 90;

type ExistingGroupIngestionPolicy = {
  ingestionEnabled: boolean;
  ingestionApprovedAt: Date | null;
  ingestionApprovedById: string | null;
  autoPublicationEnabled: boolean;
  manualReviewRequired: boolean;
  minimumConfidence: number;
  ingestionPausedAt: Date | null;
};

export type SyncedGroupIngestionPolicy = {
  ingestionEnabled: true;
  ingestionApprovedAt: Date;
  ingestionApprovedById: string;
  autoPublicationEnabled: true;
  manualReviewRequired: false;
  minimumConfidence: number;
  ingestionPausedAt: null;
};

export function resolveAutoGroupIngestionAccountIds(
  configuredAccountIds = process.env.WHATSAPP_AUTO_ENABLE_ALL_GROUPS_ACCOUNT_IDS,
) {
  return new Set(
    (configuredAccountIds ?? "")
      .split(",")
      .map((accountId) => accountId.trim())
      .filter(Boolean),
  );
}

export function resolveAutoGroupIngestionMinimumConfidence(
  configuredConfidence = process.env.WHATSAPP_AUTO_ENABLE_ALL_GROUPS_MIN_CONFIDENCE,
) {
  const parsed = Number(configuredConfidence);
  if (!Number.isFinite(parsed)) return DEFAULT_AUTO_GROUP_INGESTION_MINIMUM_CONFIDENCE;
  return Math.min(100, Math.max(85, Math.round(parsed)));
}

export function shouldAutoEnableAllSyncedGroups(
  accountId: string,
  configuredAccountIds = process.env.WHATSAPP_AUTO_ENABLE_ALL_GROUPS_ACCOUNT_IDS,
) {
  return resolveAutoGroupIngestionAccountIds(configuredAccountIds).has(accountId);
}

export function resolveSyncedGroupIngestionPolicy(input: {
  accountId: string;
  ownerUserId: string;
  syncedAt: Date;
  existing?: ExistingGroupIngestionPolicy;
  configuredAccountIds?: string;
  configuredConfidence?: string;
}): SyncedGroupIngestionPolicy | undefined {
  if (!shouldAutoEnableAllSyncedGroups(input.accountId, input.configuredAccountIds)) return undefined;
  const hasExistingApprovalEvidence = Boolean(
    input.existing?.ingestionApprovedAt && input.existing.ingestionApprovedById,
  );
  return {
    ingestionEnabled: true,
    ingestionApprovedAt: hasExistingApprovalEvidence
      ? input.existing!.ingestionApprovedAt!
      : input.syncedAt,
    ingestionApprovedById: hasExistingApprovalEvidence
      ? input.existing!.ingestionApprovedById!
      : input.ownerUserId,
    autoPublicationEnabled: true,
    manualReviewRequired: false,
    minimumConfidence: resolveAutoGroupIngestionMinimumConfidence(input.configuredConfidence),
    ingestionPausedAt: null,
  };
}

export function groupIngestionPolicyNeedsUpdate(
  existing: ExistingGroupIngestionPolicy | undefined,
  desired: SyncedGroupIngestionPolicy | undefined,
) {
  if (!desired) return false;
  return !existing
    || existing.ingestionEnabled !== desired.ingestionEnabled
    || existing.ingestionApprovedAt === null
    || existing.ingestionApprovedById === null
    || existing.autoPublicationEnabled !== desired.autoPublicationEnabled
    || existing.manualReviewRequired !== desired.manualReviewRequired
    || existing.minimumConfidence !== desired.minimumConfidence
    || existing.ingestionPausedAt !== null;
}
