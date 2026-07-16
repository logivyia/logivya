# Support Flow Failure

**Symptoms:** Ticket creation fails, admin cannot see tickets, outbox items are stale, replies are missing, or notification failures rise. **Impact:** Customers cannot obtain support or receive replies.

1. Verify ticket persistence, tenant/user ownership, admin list, thread messages and outbox state in that order.
2. Inspect safe ticket IDs and event keys; do not place ticket bodies or emails in monitoring logs.
3. Recover timed-out outbox rows with the existing idempotent processor. Do not duplicate messages or alter ticket ownership.
4. If email/push is unavailable, the durable ticket/thread remains authoritative; communicate through the product when restored.
5. Run the isolated synthetic support flow and verify normal users cannot access another user's ticket.
6. Escalate when ticket persistence/admin visibility is broken; update support and email tests after resolution.
