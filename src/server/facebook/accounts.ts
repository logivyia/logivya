import "server-only";

import { ChannelAccountStatus, ChannelType, type ChannelAccount, type Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import {
  FACEBOOK_CHANNEL_NAME,
  FACEBOOK_GRAPH_VERSION,
  FACEBOOK_PAGE_PROVIDER,
  FACEBOOK_USER_PROVIDER,
} from "@/server/facebook/constants";
import { decryptFacebookToken, encryptFacebookToken } from "@/server/facebook/crypto";
import { readFacebookProfileAndPages, type FacebookProfile } from "@/server/facebook/graph-api";
import { facebookPagesProvider } from "@/server/facebook/provider";

type FacebookAccountSettings = {
  kind?: "USER_CONNECTOR" | "PAGE";
  connectedByUserId?: string;
  facebookUserId?: string;
  category?: string | null;
  username?: string | null;
  pictureUrl?: string | null;
  tasks?: string[];
  permissions?: Array<{ permission: string; status: string }>;
  graphVersion?: string;
  tokenExpiresAt?: string | null;
};

function settingsOf(value: Prisma.JsonValue | null): FacebookAccountSettings {
  return value && typeof value === "object" && !Array.isArray(value) ? value as FacebookAccountSettings : {};
}

function json(value: FacebookAccountSettings): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

async function facebookChannel(companyId: string) {
  return prisma.channel.upsert({
    where: { companyId_type_name: { companyId, type: ChannelType.FACEBOOK_PAGE, name: FACEBOOK_CHANNEL_NAME } },
    create: { companyId, type: ChannelType.FACEBOOK_PAGE, name: FACEBOOK_CHANNEL_NAME, isEnabled: true },
    update: { isEnabled: true },
  });
}

export async function storeFacebookConnection(input: {
  companyId: string;
  userId: string;
  userAccessToken: string;
  tokenExpiresAt?: Date | null;
  profile: FacebookProfile;
  pages: Awaited<ReturnType<typeof readFacebookProfileAndPages>>["pages"];
  permissions: Awaited<ReturnType<typeof readFacebookProfileAndPages>>["permissions"];
}) {
  const channel = await facebookChannel(input.companyId);
  const now = new Date();
  const connectorCommon = {
    companyId: input.companyId,
    channelId: channel.id,
    status: ChannelAccountStatus.CONNECTED,
    lastConnectedAt: now,
    lastSyncedAt: now,
    lastDisconnectedAt: null,
    archivedAt: null,
  };

  return prisma.$transaction(async (tx) => {
    await tx.channelAccount.upsert({
      where: { channelId_externalAccountId: { channelId: channel.id, externalAccountId: `user:${input.profile.id}:${input.userId}` } },
      create: {
        ...connectorCommon,
        label: input.profile.name,
        displayName: input.profile.name,
        externalAccountId: `user:${input.profile.id}:${input.userId}`,
        provider: FACEBOOK_USER_PROVIDER,
        credentialsEncrypted: encryptFacebookToken(input.userAccessToken),
        settings: json({
          kind: "USER_CONNECTOR",
          connectedByUserId: input.userId,
          facebookUserId: input.profile.id,
          permissions: input.permissions,
          graphVersion: FACEBOOK_GRAPH_VERSION,
          tokenExpiresAt: input.tokenExpiresAt?.toISOString() || null,
        }),
      },
      update: {
        ...connectorCommon,
        label: input.profile.name,
        displayName: input.profile.name,
        credentialsEncrypted: encryptFacebookToken(input.userAccessToken),
        settings: json({
          kind: "USER_CONNECTOR",
          connectedByUserId: input.userId,
          facebookUserId: input.profile.id,
          permissions: input.permissions,
          graphVersion: FACEBOOK_GRAPH_VERSION,
          tokenExpiresAt: input.tokenExpiresAt?.toISOString() || null,
        }),
      },
    });

    const allExistingPages = await tx.channelAccount.findMany({
      where: { channelId: channel.id, provider: FACEBOOK_PAGE_PROVIDER },
    });
    const existingPages = allExistingPages.filter((account) => account.externalAccountId && input.pages.some((page) => page.id === account.externalAccountId));
    const existingByPageId = new Map(existingPages.map((account) => [account.externalAccountId, account]));
    let discoveredPages = 0;
    let alreadyConnectedPages = 0;
    let ownershipConflicts = 0;
    for (const page of input.pages) {
      const existing = existingByPageId.get(page.id);
      const existingSettings = existing ? settingsOf(existing.settings) : null;
      if (existing && existingSettings?.connectedByUserId && existingSettings.connectedByUserId !== input.userId
        && existing.status !== ChannelAccountStatus.ARCHIVED) {
        ownershipConflicts += 1;
        continue;
      }
      const tasks = Array.isArray(page.tasks) ? page.tasks : [];
      const pageStatus = existing?.status === ChannelAccountStatus.CONNECTED
        && existingSettings?.connectedByUserId === input.userId
        ? ChannelAccountStatus.CONNECTED
        : ChannelAccountStatus.PENDING;
      if (pageStatus === ChannelAccountStatus.CONNECTED) alreadyConnectedPages += 1;
      else discoveredPages += 1;
      const pageSettings: FacebookAccountSettings = {
        kind: "PAGE",
        connectedByUserId: input.userId,
        facebookUserId: input.profile.id,
        category: page.category || null,
        username: page.username || null,
        pictureUrl: page.picture?.data?.url || null,
        tasks,
        graphVersion: FACEBOOK_GRAPH_VERSION,
      };
      await tx.channelAccount.upsert({
        where: { channelId_externalAccountId: { channelId: channel.id, externalAccountId: page.id } },
        create: {
          companyId: input.companyId,
          channelId: channel.id,
          status: pageStatus,
          lastConnectedAt: pageStatus === ChannelAccountStatus.CONNECTED ? now : null,
          lastSyncedAt: now,
          lastDisconnectedAt: null,
          archivedAt: null,
          label: page.name,
          displayName: page.name,
          externalAccountId: page.id,
          provider: FACEBOOK_PAGE_PROVIDER,
          credentialsEncrypted: encryptFacebookToken(page.access_token),
          settings: json(pageSettings),
        },
        update: {
          companyId: input.companyId,
          channelId: channel.id,
          status: pageStatus,
          lastConnectedAt: pageStatus === ChannelAccountStatus.CONNECTED ? existing?.lastConnectedAt || now : null,
          lastSyncedAt: now,
          lastDisconnectedAt: null,
          archivedAt: null,
          label: page.name,
          displayName: page.name,
          provider: FACEBOOK_PAGE_PROVIDER,
          credentialsEncrypted: encryptFacebookToken(page.access_token),
          settings: json(pageSettings),
        },
      });
    }
    const currentPageIds = new Set(input.pages.map((page) => page.id));
    const authorizationRequiredIds = allExistingPages
      .filter((account) => settingsOf(account.settings).connectedByUserId === input.userId)
      .filter((account) => account.externalAccountId && !currentPageIds.has(account.externalAccountId))
      .filter((account) => account.status !== ChannelAccountStatus.ARCHIVED)
      .map((account) => account.id);
    if (authorizationRequiredIds.length > 0) {
      await tx.channelAccount.updateMany({
        where: { id: { in: authorizationRequiredIds } },
        data: {
          status: ChannelAccountStatus.RECONNECT_REQUIRED,
          credentialsEncrypted: null,
          lastDisconnectedAt: now,
        },
      });
    }
    return {
      discoveredPages,
      connectedPages: alreadyConnectedPages,
      ownershipConflicts,
      authorizationRequiredPages: authorizationRequiredIds.length,
    };
  });
}

export async function syncFacebookPages(companyId: string, userId: string) {
  const connectors = await prisma.channelAccount.findMany({
    where: { companyId, provider: FACEBOOK_USER_PROVIDER, archivedAt: null, status: ChannelAccountStatus.CONNECTED },
    orderBy: { lastConnectedAt: "desc" },
  });
  const connector = connectors.find((account) => settingsOf(account.settings).connectedByUserId === userId);
  if (!connector?.credentialsEncrypted) throw new Error("FACEBOOK_RECONNECT_REQUIRED");
  const userAccessToken = decryptFacebookToken(connector.credentialsEncrypted);
  const result = await readFacebookProfileAndPages(userAccessToken);
  const tokenExpiresAt = settingsOf(connector.settings).tokenExpiresAt;
  return storeFacebookConnection({
    companyId,
    userId,
    userAccessToken,
    tokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt) : null,
    ...result,
  });
}

export async function listFacebookPages(companyId: string, userId: string) {
  const accounts = await prisma.channelAccount.findMany({
    where: { companyId, provider: FACEBOOK_PAGE_PROVIDER, archivedAt: null },
    orderBy: [{ status: "asc" }, { label: "asc" }],
  });
  return accounts.filter((account) => settingsOf(account.settings).connectedByUserId === userId).map((account) => {
    const settings = settingsOf(account.settings);
    const tasks = settings.tasks || [];
    return {
      id: account.id,
      pageId: account.externalAccountId,
      name: account.displayName || account.label,
      username: settings.username || null,
      category: settings.category || null,
      pictureUrl: settings.pictureUrl || null,
      status: account.status,
      tasks,
      canPublish: account.status === ChannelAccountStatus.CONNECTED
        && (tasks.length === 0 || tasks.includes("CREATE_CONTENT") || tasks.includes("MANAGE")),
      lastSyncedAt: account.lastSyncedAt?.toISOString() || null,
    };
  });
}

export async function requireFacebookPageAccount(companyId: string, accountId: string, userId: string) {
  const account = await prisma.channelAccount.findFirst({
    where: { id: accountId, companyId, provider: FACEBOOK_PAGE_PROVIDER, archivedAt: null },
  });
  if (!account || !account.externalAccountId) throw new Error("FACEBOOK_PAGE_NOT_FOUND");
  if (settingsOf(account.settings).connectedByUserId !== userId) throw new Error("FACEBOOK_PAGE_NOT_FOUND");
  if (account.status !== ChannelAccountStatus.CONNECTED || !account.credentialsEncrypted) throw new Error("FACEBOOK_RECONNECT_REQUIRED");
  return { account, pageId: account.externalAccountId, pageAccessToken: decryptFacebookToken(account.credentialsEncrypted) };
}

export async function connectFacebookPage(companyId: string, userId: string, accountId: string) {
  const account = await prisma.channelAccount.findFirst({
    where: { id: accountId, companyId, provider: FACEBOOK_PAGE_PROVIDER, archivedAt: null },
  });
  if (!account || settingsOf(account.settings).connectedByUserId !== userId) throw new Error("FACEBOOK_PAGE_NOT_FOUND");
  const tasks = settingsOf(account.settings).tasks || [];
  if (tasks.length > 0 && !tasks.includes("CREATE_CONTENT") && !tasks.includes("MANAGE")) {
    throw new Error("FACEBOOK_RECONNECT_REQUIRED");
  }
  if (!account.credentialsEncrypted) throw new Error("FACEBOOK_RECONNECT_REQUIRED");
  const pageAccessToken = decryptFacebookToken(account.credentialsEncrypted);
  await facebookPagesProvider.validatePageAuthorization(account.externalAccountId || "", pageAccessToken);
  return prisma.channelAccount.update({
    where: { id: account.id },
    data: { status: ChannelAccountStatus.CONNECTED, lastConnectedAt: new Date(), lastDisconnectedAt: null },
  });
}

export async function disconnectFacebookPage(companyId: string, userId: string, accountId: string) {
  const account = await prisma.channelAccount.findFirst({
    where: { id: accountId, companyId, provider: FACEBOOK_PAGE_PROVIDER, archivedAt: null },
  });
  if (!account || settingsOf(account.settings).connectedByUserId !== userId) throw new Error("FACEBOOK_PAGE_NOT_FOUND");
  const now = new Date();
  const scheduledMessages = await prisma.channelMessage.findMany({
    where: {
      channelAccountId: account.id,
      status: "QUEUED",
      externalMessageId: { not: null },
    },
    select: { id: true, externalMessageId: true },
  });
  if (scheduledMessages.length > 0) {
    if (!account.credentialsEncrypted) throw new Error("FACEBOOK_RECONNECT_REQUIRED");
    const pageAccessToken = decryptFacebookToken(account.credentialsEncrypted);
    for (const message of scheduledMessages) {
      if (message.externalMessageId) await facebookPagesProvider.deleteRemoteObject(message.externalMessageId, pageAccessToken);
    }
  }
  const scheduledMessageIds = scheduledMessages.map((message) => message.id);
  await prisma.$transaction([
    prisma.channelAccount.update({
      where: { id: account.id },
      data: {
        status: ChannelAccountStatus.ARCHIVED,
        archivedAt: now,
        lastDisconnectedAt: now,
        credentialsEncrypted: null,
      },
    }),
    prisma.facebookPublicationJob.updateMany({
      where: {
        channelAccountId: account.id,
        OR: [
          { status: { in: ["QUEUED", "FAILED"] } },
          { channelMessageId: { in: scheduledMessageIds } },
        ],
      },
      data: { status: "CANCELED", completedAt: now, lockedAt: null, lockedBy: null, lastErrorCode: "FACEBOOK_PAGE_DISCONNECTED" },
    }),
    prisma.channelMessage.updateMany({
      where: { channelAccountId: account.id, status: { in: ["PENDING", "QUEUED", "FAILED"] } },
      data: { status: "CANCELED", errorCode: "FACEBOOK_PAGE_DISCONNECTED", errorMessage: "Facebook Sayfası bağlantısı kaldırıldı." },
    }),
  ]);
  return { disconnected: true };
}

export function facebookAccountSettings(account: Pick<ChannelAccount, "settings">) {
  return settingsOf(account.settings);
}
