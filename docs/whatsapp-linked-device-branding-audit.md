# WhatsApp Linked-Device Branding Audit

## Decision

**B. Supported but requires re-pairing. Production rollout remains NO-GO until a real authorized test account confirms the label in WhatsApp > Linked devices.**

## Architecture and source

- LOGIVYA uses `@whiskeysockets/baileys` 6.7.22 directly. It does not use Puppeteer, Playwright, Chromium, or `whatsapp-web.js` for WhatsApp sessions.
- `src/worker/baileys-provider.ts` owns QR pairing, phone-code pairing, restore, reconnect, group/contact synchronization, and message delivery sockets.
- Baileys defines `Browsers.ubuntu(name)` as `["Ubuntu", name, "22.04.4"]`.
- Phone-code pairing sends the visible description as `${browser[1]} (${browser[0]})`.
- The previous default was `Browsers.ubuntu("Chrome")`, which produces `Chrome (Ubuntu)`. WhatsApp may render the browser product as `Google Chrome`, explaining the observed `Google Chrome (Ubuntu)`.
- The value does not come from Render, Docker, the host user-agent, or browser automation.

## Safe implementation

- `WHATSAPP_LINKED_DEVICE_NAME` configures Baileys' supported client-name slot.
- The default remains `Chrome` when the setting is absent, so deploying code alone does not change active sessions.
- `WHATSAPP_PAIRING_BROWSER_NAME` remains a legacy fallback.
- Operating-system values remain restricted to Baileys helpers for Ubuntu, macOS, or Windows. Unknown values fall back to Ubuntu.
- Unsafe, control-character, markup-like, or overlong client names fall back to `Chrome`.

The exact requested `Google Chrome (LOGIVYA)` is intentionally not generated. Producing it would require placing `LOGIVYA` in the operating-system slot, which would be misleading protocol metadata. The safe candidate is `LOGIVYA (Ubuntu)`.

## Existing sessions and migration

Linked-device identity is registered while pairing. Changing the environment does not rewrite the description stored for an already linked device. Existing sessions must not be logged out automatically.

Safe migration:

1. Set `WHATSAPP_LINKED_DEVICE_NAME=LOGIVYA` only on an isolated test worker.
2. Pair a dedicated authorized test WhatsApp account as a new device.
3. Confirm the actual label in WhatsApp > Linked devices.
4. Send and receive a message, restart the worker, verify restore, and verify that no duplicate device appears.
5. Only after that evidence, enable the setting in production and let customers opt into re-pairing if they want the new label.

## Impact

- No session keys, Noise keys, signed identities, snapshots, ownership data, queues, or message records are changed.
- QR and phone-code flows continue to use the same canonical socket factory.
- Existing sessions remain compatible because the production default stays `Chrome` until the environment is explicitly enabled.
- A real Linked devices screenshot is still required; automated tests can prove the generated tuple but cannot prove WhatsApp's final UI rendering.

## Verification status

Automated evidence completed:

- Canonical default, branded, legacy, invalid-name, and unsupported-OS metadata cases pass.
- Session persistence, message delivery, Delete for Everyone, and continuous-delivery contracts pass.
- Repository lint passes.
- The production web bundle compiles with Webpack before reaching an unrelated pre-existing MFA type error.

Release blockers unrelated to this change:

- Full typecheck is blocked by pre-existing nullable secret errors in `src/server/security/mfa.ts`.
- Database-backed group isolation audit requires `DATABASE_URL` in the isolated worktree.
- The broad WhatsApp source audit reports a pre-existing raw `PENDING_PAIRING` marker in `src/i18n/status.ts`.

Evidence still required for rollout:

- Pair one disposable authorized account on an isolated worker with `WHATSAPP_LINKED_DEVICE_NAME=LOGIVYA`.
- Capture WhatsApp > Linked devices and confirm the final label actually rendered by WhatsApp.
- Complete send, restart, restore, reconnect, and duplicate-device checks on that test account.

Until those steps pass, production deployment and forced customer re-pairing remain **NO-GO**.
