# WhatsApp Data Privacy Assessment

Status: `LEGAL REVIEW REQUIRED`

This is an engineering assessment, not a legal opinion. It does not establish that a customer's recipient list or message purpose is lawful.

## Data flow

1. An authenticated company user pairs a WhatsApp account through the protected worker.
2. Encrypted session material is stored separately from ordinary application records and is never included in logs or privacy exports.
3. Contacts, groups and delivery metadata are stored with `companyId`, `userId` and `accountId` ownership.
4. A customer selects recipients and creates content. Queue payloads carry identifiers and bounded delivery data, not reusable credentials.
5. Delivery outcomes are written to tenant-scoped history. Optional analytics must not receive contact names, phone numbers, group names or message content.

## Role hypothesis

| Activity | Candidate LOGIVYA role | Candidate customer role | Review |
| --- | --- | --- | --- |
| Pairing and platform security | Controller for service/security metadata | Customer account administrator | Counsel review required |
| Customer contacts and groups | Processor | Controller | DPA and instructions required |
| Campaign content and recipients | Processor | Controller | Customer lawful-purpose evidence required |
| Abuse prevention and audit | Controller | Cooperation duty | Balancing/legal-basis review required |

## Technical controls retained

- Backend ownership guards and tenant-scoped queries.
- No administrator contact reuse and no cross-company contact cache.
- Encrypted session snapshots; credentials excluded from API responses, logs and exports.
- Delete-for-Everyone and message delivery remain in the protected stable core and were not modified in this phase.
- Privacy export includes only the requesting user's account-scoped records.

## Open decisions

- Customer notice duties to recipients and group participants.
- Commercial-message consent/evidence obligations by jurisdiction.
- WhatsApp/Meta contractual role, transfer destination, retention and subprocessor terms.
- Maximum retention for message bodies, recipient results and disconnected account metadata.
- Whether particular message content creates special-category-data risk.

No public notice or contract language from this assessment may be published before qualified legal review.
