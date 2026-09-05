import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createNotificationResponseDeduper,
  notificationResponseKey,
} from "../apps/mobile/src/services/notification-response-dedupe";

function response(identifier: string, actionIdentifier = "expo.modules.notifications.actions.DEFAULT") {
  return { actionIdentifier, notification: { request: { identifier } } };
}

const first = response("marketplace-match-1");
const deduper = createNotificationResponseDeduper(2);
assert.equal(notificationResponseKey(first), "marketplace-match-1:expo.modules.notifications.actions.DEFAULT");
assert.equal(deduper.shouldHandle(first), true, "The initial cold-start response must be handled");
assert.equal(deduper.shouldHandle(first), false, "The listener must not replay the same initial response");
assert.equal(deduper.shouldHandle(response("marketplace-match-2")), true);
assert.equal(deduper.shouldHandle(response("marketplace-match-3")), true);
assert.equal(deduper.shouldHandle(first), true, "The bounded dedupe cache must eventually evict old responses");

const source = readFileSync(path.join(process.cwd(), "apps/mobile/src/services/notifications.ts"), "utf8");
const listenerIndex = source.indexOf("addNotificationResponseReceivedListener");
const initialIndex = source.indexOf("getLastNotificationResponse()");
assert(listenerIndex >= 0, "Live notification response listener is missing");
assert(initialIndex > listenerIndex, "Register the listener before consuming the cold-start response to close the race window");
assert(source.includes('handleNotificationResponse(event, onOpen, "listener")'));
assert(source.includes('handleNotificationResponse(initialResponse, onOpen, "initial")'));
assert(source.includes("clearLastNotificationResponse()"), "The consumed native response must be cleared");
assert(source.includes("getNotificationDeepLink(event.notification.request.content.data ?? {})"), "Cold and live responses must share validated deep-link routing");
assert(source.includes("notificationResponseDeduper.shouldHandle(event)"), "Cold and live response races must be deduplicated");

console.log("mobile notification cold-start contracts passed");
