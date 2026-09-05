# Notification Privacy

Every query and mutation is scoped by authenticated `companyId` and `userId`, except backend-authorized platform administrator operations. Delivery records store a recipient hash rather than an address where practical. Device tokens and Web Push subscriptions are encrypted at rest.

Logs must include correlation identifiers but never notification secrets, access tokens, device tokens or full sensitive message bodies. Administrator dead-letter views expose safe error codes and limited metadata. Marketing consent and channel preferences are backend-enforced.

Cross-tenant tests must prove one company cannot read another company's notifications, devices, preferences or delivery records.
