# Logivya WhatsApp Message Delivery Architecture

Build marker: ENTERPRISE WHATSAPP CONNECTION SUBSCRIPTION DELIVERY RECOVERY

## Supported clients

- Desktop web and mobile web use the protected web session cookie and submit messages through `POST /api/campaigns`.
- Android uses mobile access and refresh tokens and submits messages through `POST /api/mobile/messages/send` or `POST /api/mobile/messages/schedule`.
- All three clients converge on `createMessageDeliveryCampaign` in `src/server/messages/delivery-pipeline.ts`.

## End-to-end flow

1. The client authenticates.
   - Web: `requireApiSession` reads the session cookie, then reloads user, company, and membership from the database.
   - Android: `requireMobileAuth` verifies the mobile JWT, checks the stored device session, then reloads user, company, and membership from the database.
2. The API validates the request body.
   - Web route: `src/app/api/campaigns/route.ts`
   - Mobile send route: `src/app/api/mobile/messages/send/route.ts`
   - Mobile schedule route: `src/app/api/mobile/messages/schedule/route.ts`
3. `createMessageDeliveryCampaign` performs the single shared business flow.
   - Permission stage: owner/admin/operator can send; viewer cannot.
   - Schedule validation stage: scheduled jobs must be in the future, recurring jobs must have a rule.
   - Audience stage: category groups and direct groups are resolved inside the current company only.
   - WhatsApp group stage: `resolveSendableWhatsAppGroups` deduplicates by external group id, prefers connected/sendable rows, and self-heals reconnectable accounts.
   - Subscription stage: `subscriptionAccess.getCurrent` chooses a currently valid active/trialing subscription, not simply the latest row.
   - Message access stage: active valid subscription allows message sending. Old `maxGroups`, `maxMessagesPerDay`, and `maxMessagesPerMonth` values do not block sending.
   - Feature access stage: active valid subscription allows scheduled and recurring messages. Old plan feature flags do not block active customers.
4. The campaign and recipients are created in the database.
5. Recipient jobs are enqueued to BullMQ with the same `correlationId`.
6. The worker reloads the recipient, campaign, group, and account from the database.
7. The worker verifies tenant consistency.
8. The worker resolves the final sendable WhatsApp group again so stale `canSend` or stale account ids do not block recoverable accounts.
9. Baileys sends the group message.
10. The worker stores the WhatsApp message key, marks the recipient sent, and updates campaign aggregate status.

## Subscription source of truth

`src/server/billing/subscription-access.ts` is the only source of truth for customer messaging subscription decisions.

- `getCurrent(companyId)` ranks subscriptions by real validity and uses the valid active/trialing record when one exists.
- `canSendMessage(companyId)` checks only active validity; it does not apply daily or monthly message limits.
- `canUseScheduledMessages(companyId)` and `canUseRecurringMessages(companyId)` check only active validity; stale plan feature flags cannot create a package-not-eligible block.
- WhatsApp account connection still enforces the account count limit, but failed/reusable single-slot accounts can be reused instead of forcing an upgrade.

## WhatsApp connection flow

- Web QR and phone pairing:
  - `src/app/api/accounts/whatsapp/create-session/route.ts`
  - `src/app/api/accounts/whatsapp/create-pairing-session/route.ts`
- Android QR and phone pairing:
  - `src/app/api/mobile/whatsapp/accounts/qr/route.ts`
  - `src/app/api/mobile/whatsapp/accounts/phone-code/route.ts`
- All connection routes scope accounts by `company.id`.
- Mobile and web both return the already connected account instead of creating another connection session.
- Worker jobs own the actual Baileys QR, pairing, reconnect, sync, and send operations.

## Group ownership and visibility

- `src/app/api/platform/route.ts` and `src/app/api/mobile/groups/route.ts` list groups for the current company only.
- Both routes filter to recoverable WhatsApp account states and deduplicate repeated external group ids.
- `resolveSendableWhatsAppGroups` is used by the send pipeline and worker; it never chooses a global, admin, or cross-company group.

## Observability contract

Every message operation has a `MSG-XXXXXXXX` correlation id.

Primary API pipeline stages:

- `auth.permission`
- `request.schedule.validate`
- `audience.category_groups.resolve`
- `audience.sendable_groups.resolve`
- `subscription.message_access`
- `subscription.feature_access`
- `campaign.create`
- `queue.recipients.enqueue`
- `queue.recurring.enqueue`
- `audit.write`

Worker stages:

- `worker.target.resolve`
- `worker.recipient.retarget`
- `worker.baileys.send`
- `worker.recipient.mark_sent`

Queue logs include `queueJobId`, `campaignId`, `recipientId`, `companyId`, `source`, and `correlationId`.

## Production verification checklist

- New customer trial can connect WhatsApp, sync groups, create categories, assign groups, and send immediately.
- New customer trial can schedule a message.
- Recurring campaign creation is accepted for an active/trialing subscription.
- Old plan rows with false schedule/recurring feature flags do not block sending.
- Old plan rows with `maxGroups`, `maxMessagesPerDay`, or `maxMessagesPerMonth` do not block sending.
- Normal users cannot send for another company.
- Viewer users receive `MESSAGING_PERMISSION_DENIED`.
- Worker restart does not break queued recipients because the worker reloads campaign, account, and group state from the database.
- Network or Baileys transient disconnects enqueue reconnect and recoverable retry jobs.
