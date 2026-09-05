import { mkdir } from "node:fs/promises";
import path from "node:path";

import { Prisma, type TelegramAuthState, type TelegramChatType } from "@prisma/client";
import { getTdjson, getTdlibInfo } from "prebuilt-tdlib";
import * as tdl from "tdl";
import type * as Td from "tdlib-types";

import { prisma } from "@/server/db";
import { ingestOwnedTelegramGroupMessage } from "@/server/freight/smart-ingestion";
import { logger } from "@/server/observability/logger";
import { decryptTelegramDatabaseKey } from "@/server/telegram/crypto";
import { maskTelegramPhone } from "@/server/telegram/phone";
import type { OutboundMessageAttachment } from "@/server/media/message-attachments";

type ManagedClient = {
  accountId: string;
  client: tdl.Client;
  state: TelegramAuthState;
  stateDetail: Record<string, unknown>;
  connectionState: string;
};

type TelegramAccountRecord = Awaited<ReturnType<typeof loadAccount>>;

const clients = new Map<string, ManagedClient>();
const pendingClients = new Map<string, Promise<ManagedClient>>();
const pendingAuthSubmissions = new Map<string, Promise<ReturnType<typeof authResult>>>();
const AUTH_SUBMISSION_ACK_TIMEOUT_MS = 2_000;
let configured = false;

function telegramInboundText(message: Td.message) {
  if (message.content._ === "messageText") return message.content.text.text;
  if (message.content._ === "messagePhoto") return message.content.caption.text;
  if (message.content._ === "messageVideo") return message.content.caption.text;
  if (message.content._ === "messageDocument") return message.content.caption.text;
  return "";
}

function configureTdlib() {
  if (configured) return;
  tdl.configure({ tdjson: getTdjson(), verbosityLevel: 1 });
  tdl.setLogMessageCallback(1, () => {
    logger.warn("telegram.tdlib_error", { redacted: true });
  });
  configured = true;
}

function telegramCredentials() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH?.trim();
  if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) throw new Error("TELEGRAM_API_CREDENTIALS_NOT_CONFIGURED");
  return { apiId, apiHash };
}

function sessionRoot() {
  return path.resolve(process.env.TELEGRAM_SESSION_DIR || path.join(process.cwd(), ".telegram-sessions"));
}

async function loadAccount(accountId: string) {
  const account = await prisma.telegramAccount.findUnique({
    where: { id: accountId },
    include: { channelAccount: true },
  });
  if (!account || account.archivedAt) throw new Error("TELEGRAM_ACCOUNT_NOT_FOUND");
  return account;
}

export function telegramAuthStateSnapshot(state: Td.AuthorizationState): { state: TelegramAuthState; detail: Record<string, unknown> } {
  switch (state._) {
    case "authorizationStateWaitPhoneNumber":
      return { state: "WAIT_PHONE_NUMBER", detail: {} };
    case "authorizationStateWaitEmailAddress":
      return { state: "WAIT_EMAIL_ADDRESS", detail: { allowAppleId: state.allow_apple_id, allowGoogleId: state.allow_google_id } };
    case "authorizationStateWaitEmailCode":
      return { state: "WAIT_EMAIL_CODE", detail: { emailPattern: state.code_info.email_address_pattern, length: state.code_info.length } };
    case "authorizationStateWaitCode":
      return {
        state: "WAIT_CODE",
        detail: {
          deliveryType: state.code_info.type._,
          nextType: state.code_info.next_type?._ ?? null,
          timeoutSeconds: state.code_info.timeout,
        },
      };
    case "authorizationStateWaitPassword":
      return { state: "WAIT_PASSWORD", detail: { passwordHint: state.password_hint, hasRecoveryEmail: state.has_recovery_email_address } };
    case "authorizationStateWaitOtherDeviceConfirmation":
      return { state: "WAIT_OTHER_DEVICE", detail: { confirmationRequired: true } };
    case "authorizationStateReady":
      return { state: "READY", detail: {} };
    case "authorizationStateLoggingOut":
      return { state: "LOGGING_OUT", detail: {} };
    case "authorizationStateClosed":
      return { state: "CLOSED", detail: {} };
    default:
      return { state: "STARTING", detail: {} };
  }
}

function channelStatus(state: TelegramAuthState) {
  if (state === "READY") return "CONNECTED" as const;
  if (state === "CLOSED" || state === "LOGGING_OUT") return "DISCONNECTED" as const;
  if (state === "ERROR") return "ERROR" as const;
  return "CONNECTING" as const;
}

async function persistState(account: TelegramAccountRecord, snapshot: { state: TelegramAuthState; detail: Record<string, unknown> }) {
  const now = new Date();
  await prisma.$transaction([
    prisma.telegramAccount.update({
      where: { id: account.id },
      data: {
        authState: snapshot.state,
        authStateDetail: snapshot.detail as Prisma.InputJsonValue,
        status: snapshot.state === "READY" ? "CONNECTED" : snapshot.state === "CLOSED" ? "DISCONNECTED" : "AUTHENTICATING",
        lastConnectedAt: snapshot.state === "READY" ? now : undefined,
        lastDisconnectedAt: snapshot.state === "CLOSED" ? now : undefined,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    }),
    prisma.channelAccount.update({
      where: { id: account.channelAccountId },
      data: {
        status: channelStatus(snapshot.state),
        lastConnectedAt: snapshot.state === "READY" ? now : undefined,
        lastDisconnectedAt: snapshot.state === "CLOSED" ? now : undefined,
      },
    }),
  ]);
}

async function persistError(account: TelegramAccountRecord, error: unknown) {
  const code = error instanceof Error ? error.message.slice(0, 120) : "TDLIB_ERROR";
  await prisma.$transaction([
    prisma.telegramAccount.update({
      where: { id: account.id },
      data: { status: "ERROR", authState: "ERROR", lastErrorCode: code, lastErrorMessage: code },
    }),
    prisma.channelAccount.update({ where: { id: account.channelAccountId }, data: { status: "ERROR" } }),
  ]).catch(() => undefined);
}

async function persistReadyIdentity(account: TelegramAccountRecord, client: tdl.Client) {
  const me = await client.invoke({ _: "getMe" });
  const phone = me.phone_number ? `+${me.phone_number.replace(/^\+/, "")}` : null;
  const username = me.usernames?.active_usernames[0] ?? null;
  const now = new Date();
  await prisma.$transaction([
    prisma.telegramAccount.update({
      where: { id: account.id },
      data: {
        telegramUserId: String(me.id),
        firstName: me.first_name || null,
        lastName: me.last_name || null,
        username,
        phoneNumberMasked: phone ? maskTelegramPhone(phone) : null,
        status: "CONNECTED",
        authState: "READY",
        authStateDetail: {},
        lastConnectedAt: now,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    }),
    prisma.channelAccount.update({
      where: { id: account.channelAccountId },
      data: { externalAccountId: String(me.id), displayName: [me.first_name, me.last_name].filter(Boolean).join(" "), status: "CONNECTED", lastConnectedAt: now },
    }),
  ]);
  void syncTelegramChats(account.id).catch((error) => {
    logger.warn("telegram.initial_chat_sync_failed", { accountId: account.id, code: error instanceof Error ? error.message.slice(0, 120) : "UNKNOWN" });
  });
}

async function createManagedClient(account: TelegramAccountRecord): Promise<ManagedClient> {
  configureTdlib();
  const { apiId, apiHash } = telegramCredentials();
  const accountRoot = path.join(sessionRoot(), account.storageKey);
  const databaseDirectory = path.join(accountRoot, "database");
  const filesDirectory = path.join(accountRoot, "files");
  await Promise.all([mkdir(databaseDirectory, { recursive: true }), mkdir(filesDirectory, { recursive: true })]);
  const client = tdl.createClient({
    apiId,
    apiHash,
    databaseDirectory,
    filesDirectory,
    databaseEncryptionKey: decryptTelegramDatabaseKey(account.databaseKeyEncrypted),
    skipOldUpdates: false,
    tdlibParameters: {
      use_message_database: true,
      use_secret_chats: false,
      system_language_code: "tr",
      application_version: process.env.LOG_RELEASE_VERSION || "internal-test",
      device_model: "Logivya Hetzner Worker",
      system_version: process.platform,
    },
  });
  const managed: ManagedClient = {
    accountId: account.id,
    client,
    state: "STARTING",
    stateDetail: {},
    connectionState: "connectionStateWaitingForNetwork",
  };
  clients.set(account.id, managed);
  client.on("update", (update) => {
    if (update._ === "updateConnectionState") {
      managed.connectionState = update.state._;
      logger.info("telegram.connection_state_changed", { accountId: account.id, connectionState: managed.connectionState });
      return;
    }
    if (update._ === "updateNewMessage") {
      const message = update.message;
      const text = message.is_outgoing ? "" : telegramInboundText(message).trim();
      if (text) {
        void ingestOwnedTelegramGroupMessage({
          accountId: account.id,
          externalChatId: String(message.chat_id),
          sourceMessageId: String(message.id),
          sourceMessageTimestamp: new Date(message.date * 1_000),
          text,
        }).catch((error) => logger.error("smart_matching.telegram_ingestion_failed", error, {
          accountId: account.id,
          externalChatId: String(message.chat_id),
          sourceMessageId: String(message.id),
        }));
      }
      return;
    }
    if (update._ !== "updateAuthorizationState") return;
    const snapshot = telegramAuthStateSnapshot(update.authorization_state);
    managed.state = snapshot.state;
    managed.stateDetail = snapshot.detail;
    void persistState(account, snapshot).then(async () => {
      if (snapshot.state === "READY") await persistReadyIdentity(account, client);
      if (snapshot.state === "CLOSED") clients.delete(account.id);
    }).catch((error) => logger.error("telegram.auth_state_persist_failed", error, { accountId: account.id }));
  });
  client.on("error", (error) => {
    managed.state = "ERROR";
    managed.stateDetail = {};
    logger.error("telegram.tdlib_client_error", error, { accountId: account.id });
    void persistError(account, error);
  });
  // TDLib starts offline and remains in connectionStateWaitingForNetwork until
  // the host application explicitly announces an available network.
  await client.invoke({ _: "setNetworkType", type: { _: "networkTypeOther" } });
  const state = await client.invoke({ _: "getAuthorizationState" });
  const snapshot = telegramAuthStateSnapshot(state);
  managed.state = snapshot.state;
  managed.stateDetail = snapshot.detail;
  await persistState(account, snapshot);
  if (snapshot.state === "READY") await persistReadyIdentity(account, client);
  return managed;
}

export async function ensureTelegramClient(accountId: string) {
  const existing = clients.get(accountId);
  if (existing && !existing.client.isClosed()) return existing;
  const pending = pendingClients.get(accountId);
  if (pending) return pending;
  const promise = loadAccount(accountId).then(createManagedClient).finally(() => pendingClients.delete(accountId));
  pendingClients.set(accountId, promise);
  return promise;
}

export async function backfillTelegramFreightCandidates(
  accountId: string,
  options: { maxChats?: number; messagesPerChat?: number } = {},
) {
  const managed = await ensureTelegramClient(accountId);
  if (managed.state !== "READY") throw new Error("TELEGRAM_ACCOUNT_NOT_READY");
  const maxChats = Math.min(100, Math.max(1, options.maxChats ?? 50));
  const messagesPerChat = Math.min(100, Math.max(1, options.messagesPerChat ?? 50));
  const chats = await prisma.telegramChat.findMany({
    where: {
      accountId,
      type: { in: ["BASIC_GROUP", "SUPERGROUP", "CHANNEL"] },
      isActive: true,
      isArchived: false,
    },
    select: { externalChatId: true },
    orderBy: { lastSyncedAt: "desc" },
    take: maxChats,
  });
  const cutoff = Date.now() - 7 * 86_400_000;
  let messagesAnalyzed = 0;
  let candidatesDetected = 0;
  for (const chat of chats) {
    const history = await managed.client.invoke({
      _: "getChatHistory",
      chat_id: Number(chat.externalChatId),
      from_message_id: 0,
      offset: 0,
      limit: messagesPerChat,
      only_local: false,
    });
    for (const message of history.messages) {
      if (!message || message.is_outgoing || message.date * 1_000 < cutoff) continue;
      const text = telegramInboundText(message).trim();
      if (!text) continue;
      messagesAnalyzed += 1;
      const result = await ingestOwnedTelegramGroupMessage({
        accountId,
        externalChatId: String(message.chat_id),
        sourceMessageId: String(message.id),
        sourceMessageTimestamp: new Date(message.date * 1_000),
        text,
      });
      candidatesDetected += result.persisted;
    }
  }
  return { groupsProcessed: chats.length, messagesAnalyzed, candidatesDetected };
}

async function waitForStateChange(managed: ManagedClient, previous: TelegramAuthState, timeoutMs = 8_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (managed.state !== previous) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return authResult(managed);
}

function authResult(managed: ManagedClient, detail: Record<string, unknown> = {}) {
  return {
    authState: managed.state,
    status: managed.state === "READY" ? "CONNECTED" : "AUTHENTICATING",
    detail: { ...managed.stateDetail, ...detail },
  };
}

function validateAuthenticationStep(step: string, state: TelegramAuthState) {
  const valid = (step === "phone" && state === "WAIT_PHONE_NUMBER")
    || (step === "code" && state === "WAIT_CODE")
    || (step === "password" && state === "WAIT_PASSWORD")
    || (step === "email" && state === "WAIT_EMAIL_ADDRESS")
    || (step === "email_code" && state === "WAIT_EMAIL_CODE");
  if (!valid) throw new Error(`TELEGRAM_AUTH_STATE_${state}`);
}

async function invokeTelegramAuthentication(managed: ManagedClient, step: string, value: string) {
  if (step === "phone") {
    await managed.client.invoke({ _: "setAuthenticationPhoneNumber", phone_number: value });
  } else if (step === "code") {
    await managed.client.invoke({ _: "checkAuthenticationCode", code: value });
  } else if (step === "password") {
    await managed.client.invoke({ _: "checkAuthenticationPassword", password: value });
  } else if (step === "email") {
    await managed.client.invoke({ _: "setAuthenticationEmailAddress", email_address: value });
  } else if (step === "email_code") {
    await managed.client.invoke({ _: "checkAuthenticationEmailCode", code: { _: "emailAddressAuthenticationCode", code: value } });
  }
}

export async function submitTelegramAuthentication(accountId: string, step: string, value: string) {
  const managed = await ensureTelegramClient(accountId);
  const previous = managed.state;
  validateAuthenticationStep(step, previous);

  const existing = pendingAuthSubmissions.get(accountId);
  if (existing) return authResult(managed, { accepted: true, reused: true });

  const operation = invokeTelegramAuthentication(managed, step, value)
    .then(() => waitForStateChange(managed, previous));
  pendingAuthSubmissions.set(accountId, operation);
  void operation.then(
    (result) => logger.info("telegram.auth_submission_completed", { accountId, step, authState: result.authState }),
    (error) => logger.error("telegram.auth_submission_failed", error, { accountId, step }),
  ).finally(() => {
    if (pendingAuthSubmissions.get(accountId) === operation) pendingAuthSubmissions.delete(accountId);
  });

  const outcome = await Promise.race([
    operation.then(
      (result) => ({ settled: true as const, result }),
      (error: unknown) => ({ settled: true as const, error }),
    ),
    new Promise<{ settled: false }>((resolve) => {
      setTimeout(() => resolve({ settled: false }), AUTH_SUBMISSION_ACK_TIMEOUT_MS);
    }),
  ]);
  if (outcome.settled) {
    if ("error" in outcome) throw outcome.error;
    return outcome.result;
  }
  return authResult(managed, { accepted: true, processing: true });
}

function usernameFrom(value: { usernames?: { active_usernames: Array<string> } }) {
  return value.usernames?.active_usernames[0] ?? null;
}

async function describeChat(client: tdl.Client, chat: Td.chat) {
  let type: TelegramChatType = "UNKNOWN";
  let username: string | null = null;
  let participantCount = 0;
  let canSend = chat.permissions.can_send_basic_messages;
  let memberStatus: string | null = null;

  if (chat.type._ === "chatTypeBasicGroup") {
    type = "BASIC_GROUP";
    const group = await client.invoke({ _: "getBasicGroup", basic_group_id: chat.type.basic_group_id });
    participantCount = group.member_count;
    memberStatus = group.status._;
    canSend = !["chatMemberStatusLeft", "chatMemberStatusBanned"].includes(group.status._) && canSend;
  } else if (chat.type._ === "chatTypeSupergroup") {
    type = chat.type.is_channel ? "CHANNEL" : "SUPERGROUP";
    const group = await client.invoke({ _: "getSupergroup", supergroup_id: chat.type.supergroup_id });
    participantCount = group.member_count;
    username = usernameFrom(group);
    memberStatus = group.status._;
    if (chat.type.is_channel) {
      canSend = group.status._ === "chatMemberStatusCreator"
        || (group.status._ === "chatMemberStatusAdministrator" && group.status.rights.can_post_messages);
    } else if (group.status._ === "chatMemberStatusRestricted") {
      canSend = group.status.is_member && group.status.permissions.can_send_basic_messages;
    } else {
      canSend = !["chatMemberStatusLeft", "chatMemberStatusBanned"].includes(group.status._) && canSend;
    }
  } else if (chat.type._ === "chatTypePrivate") {
    type = "PRIVATE";
    const user = await client.invoke({ _: "getUser", user_id: chat.type.user_id });
    username = usernameFrom(user);
  } else if (chat.type._ === "chatTypeSecret") {
    type = "SECRET";
    canSend = false;
  }

  return {
    type,
    username,
    participantCount,
    canSend,
    permissions: {
      canSendBasicMessages: canSend,
      canSendPhotos: chat.permissions.can_send_photos,
      canSendVideos: chat.permissions.can_send_videos,
      canSendDocuments: chat.permissions.can_send_documents,
      memberStatus,
    },
  };
}

export async function syncTelegramChats(accountId: string) {
  const managed = await ensureTelegramClient(accountId);
  if (managed.state !== "READY") throw new Error("TELEGRAM_ACCOUNT_NOT_READY");
  const account = await loadAccount(accountId);
  const [main, archive] = await Promise.all([
    managed.client.invoke({ _: "getChats", chat_list: { _: "chatListMain" }, limit: 1000 }),
    managed.client.invoke({ _: "getChats", chat_list: { _: "chatListArchive" }, limit: 1000 }),
  ]);
  const archiveIds = new Set(archive.chat_ids.map(String));
  const chatIds = [...new Set([...main.chat_ids, ...archive.chat_ids])];
  let sendable = 0;
  for (const chatId of chatIds) {
    const chat = await managed.client.invoke({ _: "getChat", chat_id: chatId });
    const described = await describeChat(managed.client, chat);
    const isActive = !["chatMemberStatusLeft", "chatMemberStatusBanned"].includes(String(described.permissions.memberStatus || ""));
    if (described.canSend) sendable += 1;
    await prisma.telegramChat.upsert({
      where: { accountId_externalChatId: { accountId, externalChatId: String(chat.id) } },
      create: {
        companyId: account.companyId,
        accountId,
        externalChatId: String(chat.id),
        title: chat.title || "Telegram sohbeti",
        username: described.username,
        type: described.type,
        participantCount: described.participantCount,
        canSend: described.canSend,
        isActive,
        isArchived: archiveIds.has(String(chat.id)),
        rawPermissions: described.permissions,
        lastSyncedAt: new Date(),
      },
      update: {
        title: chat.title || "Telegram sohbeti",
        username: described.username,
        type: described.type,
        participantCount: described.participantCount,
        canSend: described.canSend,
        isActive,
        isArchived: archiveIds.has(String(chat.id)),
        rawPermissions: described.permissions,
        lastSyncedAt: new Date(),
      },
    });
  }
  const now = new Date();
  await prisma.$transaction([
    prisma.telegramAccount.update({ where: { id: accountId }, data: { lastSyncedAt: now } }),
    prisma.channelAccount.update({ where: { id: account.channelAccountId }, data: { lastSyncedAt: now } }),
  ]);
  return { synced: chatIds.length, sendable };
}

function formattedText(text: string): Td.formattedText$Input {
  return { _: "formattedText", text, entities: [] };
}

export async function sendTelegramMessage(input: {
  accountId: string;
  externalChatId: string;
  content: string;
  attachment?: OutboundMessageAttachment | null;
}) {
  const managed = await ensureTelegramClient(input.accountId);
  if (managed.state !== "READY") throw new Error("TELEGRAM_ACCOUNT_NOT_READY");
  const caption = formattedText(input.content);
  let inputMessageContent: Td.InputMessageContent$Input;
  if (!input.attachment) {
    inputMessageContent = {
      _: "inputMessageText",
      text: caption,
      link_preview_options: { _: "linkPreviewOptions", is_disabled: true },
      clear_draft: false,
    };
  } else {
    const localFile: Td.inputFileLocal$Input = { _: "inputFileLocal", path: input.attachment.filePath };
    if (input.attachment.kind === "PHOTO") {
      inputMessageContent = {
        _: "inputMessagePhoto",
        photo: { _: "inputPhoto", photo: localFile, added_sticker_file_ids: [], width: 0, height: 0 },
        caption,
        show_caption_above_media: false,
        has_spoiler: false,
      };
    } else if (input.attachment.kind === "VIDEO") {
      inputMessageContent = {
        _: "inputMessageVideo",
        video: { _: "inputVideo", video: localFile, added_sticker_file_ids: [], duration: 0, width: 0, height: 0, supports_streaming: true },
        caption,
        show_caption_above_media: false,
        has_spoiler: false,
      };
    } else {
      inputMessageContent = {
        _: "inputMessageDocument",
        document: { _: "inputDocument", document: localFile, disable_content_type_detection: false },
        caption,
      };
    }
  }
  const message = await managed.client.invoke({
    _: "sendMessage",
    chat_id: Number(input.externalChatId),
    input_message_content: inputMessageContent,
  });
  return { messageId: String(message.id), sentAt: new Date(message.date * 1000) };
}

export async function sendTelegramText(accountId: string, externalChatId: string, content: string) {
  return sendTelegramMessage({ accountId, externalChatId, content });
}

function telegramDeleteErrorCode(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  return value.trim().slice(0, 120) || "TELEGRAM_DELETE_FAILED";
}

export async function deleteTelegramMessagesForEveryone(
  accountId: string,
  externalChatId: string,
  externalMessageIds: string[],
) {
  const managed = await ensureTelegramClient(accountId);
  if (managed.state !== "READY") throw new Error("TELEGRAM_ACCOUNT_NOT_READY");

  const chatId = Number(externalChatId);
  if (!Number.isSafeInteger(chatId)) throw new Error("TELEGRAM_CHAT_ID_INVALID");

  const uniqueMessageIds = [...new Set(externalMessageIds)];
  const deletable: number[] = [];
  const failed: Array<{ messageId: string; code: string }> = [];

  for (const externalMessageId of uniqueMessageIds) {
    const messageId = Number(externalMessageId);
    if (!Number.isSafeInteger(messageId)) {
      failed.push({ messageId: externalMessageId, code: "TELEGRAM_MESSAGE_ID_INVALID" });
      continue;
    }
    try {
      const properties = await managed.client.invoke({
        _: "getMessageProperties",
        chat_id: chatId,
        message_id: messageId,
      });
      if (!properties.can_be_deleted_for_all_users) {
        failed.push({
          messageId: externalMessageId,
          code: "TELEGRAM_DELETE_FOR_EVERYONE_FORBIDDEN",
        });
        continue;
      }
      deletable.push(messageId);
    } catch (error) {
      failed.push({ messageId: externalMessageId, code: telegramDeleteErrorCode(error) });
    }
  }

  const deleted: string[] = [];
  for (let index = 0; index < deletable.length; index += 100) {
    const batch = deletable.slice(index, index + 100);
    try {
      await managed.client.invoke({
        _: "deleteMessages",
        chat_id: chatId,
        message_ids: batch,
        revoke: true,
      });
      deleted.push(...batch.map(String));
    } catch (error) {
      const code = telegramDeleteErrorCode(error);
      failed.push(...batch.map((messageId) => ({ messageId: String(messageId), code })));
    }
  }

  return { deletedMessageIds: deleted, failed };
}

export async function logoutTelegramClient(accountId: string) {
  const managed = await ensureTelegramClient(accountId);
  if (!managed.client.isClosed()) await managed.client.invoke({ _: "logOut" });
  clients.delete(accountId);
  return { loggedOut: true };
}

export function telegramRuntimeInfo() {
  const connectionStates: Record<string, number> = {};
  for (const managed of clients.values()) {
    connectionStates[managed.connectionState] = (connectionStates[managed.connectionState] ?? 0) + 1;
  }
  return { tdlib: getTdlibInfo(), clients: clients.size, connectionStates };
}

export async function closeAllTelegramClients() {
  await Promise.allSettled([...clients.values()].map((managed) => managed.client.close()));
  clients.clear();
}
