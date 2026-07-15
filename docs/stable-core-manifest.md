# Stable Core Manifest

This manifest makes production-critical ownership explicit. A change is allowed only when deliberate, reviewed and accompanied by the listed tests.

## Baselines

- Historical protected mobile baseline: tag `stable-whatsapp-message-core-v61`, commit `56a1d61cc7c92921e9d1a512695a6ceeb3b36a50`, Android 61 / 1.0.60.
- Current production candidate: commit `cae4004b0f5ae0918bfbb8095ee0404bb6cfb6f9`, Vercel deployment `dpl_H5r8fky5CgJqSyZFumex9zXtmksP`, migration `20260715180000_support_ticket_priority_rank`, Android candidate 123 / 1.0.93.
- The current candidate is not tagged as a new stable baseline until restore and manual real-account gates complete.

## Protected systems

| System | Main files/tables | Invariants | Required tests |
| --- | --- | --- | --- |
| Authentication/session | `src/server/auth`, auth API routes, User/Session/RefreshToken | Backend-authoritative identity; logout clears client state without unlinking WhatsApp | mobile auth resilience, admin security, typecheck |
| Platform admin | `platform-owner.ts`, admin guards/routes | Only the configured product owner policy receives platform admin; backend enforces it | admin security, mobile admin parity |
| WhatsApp pairing/socket | `src/worker/baileys-provider.ts`, account locks, WhatsAppAccount | Account-scoped locks; no cross-user socket; recoverable failures do not force auth | WhatsApp, session persistence, stable core |
| Session persistence | `session-manager.ts`, WhatsAppSession | Authenticated encryption, one snapshot per account, no credentials in logs | session persistence, restore verification |
| Group/contact isolation | account scope, contacts, sendable groups; WhatsAppGroup/Contact | companyId + userId + accountId ownership on reads and sends | group audit, contact tests, tenant isolation |
| Message delivery | delivery pipeline, worker, MessageCampaign/Recipient | Atomic recipient claim, deterministic job IDs, retry without duplicate target delivery | pipeline, continuous delivery, queue recovery |
| Scheduled/recurring | queue recurring/recovery, campaign worker | PostgreSQL is durable intent; Redis loss is reconciled; no catch-up storm | queue recovery, smart schedule tests |
| Delete for Everyone | delete service, worker, message key fields | Original provider message key and tenant/account ownership required | delete-for-everyone |
| Subscription/entitlements | billing/subscription services and subscription tables | Company-authoritative entitlement; no client-only grant | enterprise subscription, seven-day trial |
| Support | support service/routes/tables | Tenant users see own tickets; platform admin sees all; thread idempotency | support contracts/integration |
| Android auth/config | mobile API/store/config, app.json, Gradle | Production HTTPS API, package/signing lineage/version compatibility | mobile typecheck, release build and signer check |

## Change policy

1. Run `npm run test:stable-core` before and after protected changes.
2. Add a focused regression test that fails before the fix where practical.
3. Require CODEOWNERS review and green `Stable Core Gate` CI, including queue recovery, snapshot restore, worker restart and migration-failure integration checks.
4. Preserve API and database backward compatibility; use expand-and-contract migrations.
5. Never combine protected-core changes with unrelated UI refactors.
6. Real WhatsApp pairing/send/delete verification uses designated test accounts only.

The repository owner `@logivyia` is the required reviewer until a larger review group is established.
