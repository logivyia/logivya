import "server-only";

import { createHash } from "node:crypto";
import {
  ChannelAccountStatus,
  ChannelMessageStatus,
  FacebookPublicationJobStatus,
  type Prisma,
} from "@prisma/client";

import { prisma } from "@/server/db";
import { facebookAccountSettings } from "@/server/facebook/accounts";
import { FACEBOOK_PAGE_PROVIDER, FACEBOOK_USER_PROVIDER } from "@/server/facebook/constants";
import { privacyPublicId } from "@/server/privacy/ids";

function publicBaseUrl() {
  return (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.logivya.com").replace(/\/+$/u, "");
}

async function accountsForFacebookUser(facebookUserId: string) {
  const connectors = await prisma.channelAccount.findMany({
    where: {
      provider: FACEBOOK_USER_PROVIDER,
      externalAccountId: { startsWith: `user:${facebookUserId}:` },
    },
  });
  const companyIds = [...new Set(connectors.map((account) => account.companyId))];
  const pages = companyIds.length === 0 ? [] : await prisma.channelAccount.findMany({
    where: { companyId: { in: companyIds }, provider: FACEBOOK_PAGE_PROVIDER },
  });
  const connectedByUserIds = new Set(connectors.map((account) => facebookAccountSettings(account).connectedByUserId).filter(Boolean));
  const ownedPages = pages.filter((account) => {
    const settings = facebookAccountSettings(account);
    return settings.facebookUserId === facebookUserId
      && (!settings.connectedByUserId || connectedByUserIds.has(settings.connectedByUserId));
  });
  return { connectors, pages: ownedPages };
}

export async function revokeFacebookUserData(facebookUserId: string) {
  const { connectors, pages } = await accountsForFacebookUser(facebookUserId);
  const accountIds = [...new Set([...connectors, ...pages].map((account) => account.id))];
  const pageIds = pages.map((account) => account.id);
  const now = new Date();
  if (accountIds.length > 0) {
    await prisma.$transaction([
      prisma.channelAccount.updateMany({
        where: { id: { in: accountIds } },
        data: {
          status: ChannelAccountStatus.ARCHIVED,
          credentialsEncrypted: null,
          archivedAt: now,
          lastDisconnectedAt: now,
        },
      }),
      prisma.facebookPublicationJob.updateMany({
        where: {
          channelAccountId: { in: pageIds },
          status: { in: [FacebookPublicationJobStatus.QUEUED, FacebookPublicationJobStatus.FAILED] },
        },
        data: {
          status: FacebookPublicationJobStatus.CANCELED,
          completedAt: now,
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: "FACEBOOK_AUTHORIZATION_REVOKED",
        },
      }),
      prisma.channelMessage.updateMany({
        where: {
          channelAccountId: { in: pageIds },
          status: { in: [ChannelMessageStatus.PENDING, ChannelMessageStatus.FAILED] },
        },
        data: {
          status: ChannelMessageStatus.CANCELED,
          errorCode: "FACEBOOK_AUTHORIZATION_REVOKED",
          errorMessage: "Facebook yetkisi kaldırıldığı için gönderi iptal edildi.",
        },
      }),
    ]);
  }
  const connector = connectors[0];
  const settings = connector ? facebookAccountSettings(connector) : null;
  return {
    accountCount: accountIds.length,
    companyId: connector?.companyId || null,
    userId: settings?.connectedByUserId || null,
  };
}

export async function completeFacebookDataDeletion(facebookUserId: string) {
  const revoked = await revokeFacebookUserData(facebookUserId);
  const now = new Date();
  const publicId = privacyPublicId("DSR");
  await prisma.dataSubjectRequest.create({
    data: {
      publicId,
      companyId: revoked.companyId,
      userId: revoked.userId,
      type: "DELETION",
      status: "COMPLETED",
      identityVerificationStatus: "VERIFIED",
      verificationMethod: "META_SIGNED_REQUEST",
      reason: "Meta Facebook data deletion callback",
      description: "Encrypted Meta access tokens and linked Facebook Page connections were revoked and archived.",
      responseSummary: "Meta bağlantı verileri silindi veya geri döndürülemez biçimde erişime kapatıldı.",
      metadata: {
        source: "META_FACEBOOK_DATA_DELETION_CALLBACK",
        externalUserReferenceHash: createHash("sha256").update(facebookUserId).digest("hex"),
        revokedAccountCount: revoked.accountCount,
      } as Prisma.InputJsonValue,
      completedAt: now,
      closedAt: now,
      deadlineAt: now,
      events: {
        create: {
          action: "META_FACEBOOK_DATA_DELETED",
          toStatus: "COMPLETED",
          metadata: { revokedAccountCount: revoked.accountCount } as Prisma.InputJsonValue,
        },
      },
    },
  });
  return {
    confirmationCode: publicId,
    statusUrl: `${publicBaseUrl()}/facebook-data-deletion?code=${encodeURIComponent(publicId)}`,
  };
}
