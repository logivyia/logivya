# Seven-Day Trial Migration Safety Report

Generated: 2026-07-11T10:36:31.353Z

Database: `ep-proud-salad-aty4tnu7-pooler.c-9.us-east-1.aws.neon.tech`

## Policy

- New trial duration: 7 days.
- Existing migration target: active `TRIALING` subscriptions with `source = TRIAL`, trial plan ownership, and an existing duration between 71 and 73 hours.
- Expired trials are not reset or extended.
- Paid, promo, and administrator-assigned subscriptions are excluded.
- Trial creation is serialized per company and checks for an existing trial before insertion.

## Pre-Migration Findings

| Check | Result |
| --- | ---: |
| Trial plans | 1 |
| Configured trial days | 3 |
| Active three-day trials eligible for extension | 1 |
| Active seven-day trials | 0 |
| Expired three-day trials left untouched | 6 |
| Companies with duplicate trials | 0 |
| Invalid trial date ranges | 0 |
| Orphan trial subscriptions | 0 |

## Data Integrity

The repository-wide migration audit also passed with zero failures and zero warnings. It found no company/account/group orphans, cross-company category assignments, foreign message recipients, duplicate account group JIDs, or WhatsApp ownership mismatches.

## Decision

`safeToDeploy: true`

The trial migration may run after the application code passes typecheck, lint, web build, mobile typecheck, Android release build verification, and Stable Core regression checks.

## Post-Migration Verification

- Trial plan configured days: 7.
- Active three-day trials still eligible: 0.
- Active seven-day trials: 1.
- Expired three-day trials left untouched: 6.
- Database migration status: up to date.
- Registration integration test: passed inside a rollback-only transaction.
- First trial creation produced exactly seven days of access.
- A second creation attempt resolved the original trial and did not create a duplicate.
- Persistent integration-test users after rollback: 0.
